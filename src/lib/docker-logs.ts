export type LogStream = 'stdout' | 'stderr'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogLine = {
	/** Identificador incremental y estable dentro de la sesión de streaming. */
	id: number
	/** ISO timestamp de la línea. */
	ts: string
	stream: LogStream
	level: LogLevel
	message: string
}

export type LogStatus =
	| 'idle'
	| 'connecting'
	| 'live'
	| 'paused'
	| 'error'
	| 'closed'

/** Número máximo de líneas que se mantienen en memoria en el cliente. */
export const MAX_BUFFER_LINES = 5000

export const TAIL_OPTIONS = [100, 250, 500, 1000, 5000] as const

/** Normaliza una palabra de severidad (syslog / librerías de logging) a un LogLevel. */
function normalizeLevelWord(word: string): LogLevel | null {
	if (
		/^(emerg|emergency|alert|crit|critical|fatal|panic|error|err)$/.test(word)
	) {
		return 'error'
	}
	if (/^(warn|warning)$/.test(word)) return 'warn'
	if (/^(notice|info|information|informational|log)$/.test(word)) return 'info'
	if (/^(debug|dbg|trace|verbose|silly)$/.test(word)) return 'debug'
	return null
}

/**
 * Extrae el nivel de logs estructurados (JSON o logfmt), p. ej.
 * `{"level":"error"}` o `level=warn`. Es la señal más fiable, por eso
 * tiene prioridad sobre cualquier heurística por palabras.
 */
function detectStructuredLevel(message: string): LogLevel | null {
	const match = message.match(
		/["']?(?:level|lvl|severity|loglevel)["']?\s*[:=]\s*["']?([a-zA-Z]+)["']?/i
	)
	return match ? normalizeLevelWord(match[1].toLowerCase()) : null
}

/**
 * Detecta un nivel de severidad emitido como etiqueta al inicio de la línea,
 * p. ej. `[ERROR]`, `(WARN)`, `ERROR:` o `E, [timestamp]` (formato Ruby/Rails).
 */
function detectTaggedLevel(message: string): LogLevel | null {
	const match = message.match(
		/^\s*[[(]?(EMERG|ALERT|CRIT|CRITICAL|FATAL|ERROR|ERR|WARN|WARNING|NOTICE|INFO|DEBUG|TRACE)[\])]?\s*[:|\-\]]/i
	)
	return match ? normalizeLevelWord(match[1].toLowerCase()) : null
}

/**
 * Extrae un código de estado HTTP cuando aparece en un contexto HTTP reconocible
 * (un método, la versión del protocolo o una clave `status`), evitando confundir
 * números sueltos —tamaños de respuesta, duraciones— con códigos de estado.
 */
export function detectHttpStatus(message: string): number | null {
	const keyValue = message.match(
		/\bstatus(?:[_-]?code)?["']?\s*[:=]\s*["']?(\d{3})\b/i
	)
	if (keyValue) return Number(keyValue[1])

	const access = message.match(
		/(?:\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\b|HTTP\/\d(?:\.\d)?"?)[^\n]*?\s(\d{3})\b/i
	)
	if (access) {
		const code = Number(access[1])
		if (code >= 100 && code <= 599) return code
	}
	return null
}

/** Mapea un código de estado HTTP a un nivel de severidad. */
function levelFromHttpStatus(status: number): LogLevel | null {
	if (status >= 500) return 'error'
	if (status >= 400) return 'warn'
	if (status >= 100) return 'info'
	return null
}

/**
 * Clasifica la severidad de una línea con la siguiente precedencia:
 * 1. Nivel de logs estructurados (`level=`, `"level":"..."`).
 * 2. Etiqueta de nivel al inicio de la línea (`[ERROR]`, `WARN:`).
 * 3. Fallos de proceso/contenedor (OOM, segfault, salida con código != 0).
 * 4. Código de estado HTTP (5xx → error, 4xx → warn).
 * 5. Heurística por palabras clave.
 * 6. Fallback según el stream (stderr → warn, stdout → info).
 */
export function detectLevel(message: string, stream: LogStream): LogLevel {
	const structured = detectStructuredLevel(message)
	if (structured) return structured

	const tagged = detectTaggedLevel(message)
	if (tagged) return tagged

	const value = message.toLowerCase()

	// Fallos de contenedor/proceso: casi siempre son errores.
	if (
		/\b(oomkilled|out of memory|segfault|segmentation fault|core dumped|stack overflow)\b/.test(
			value
		) ||
		/\bexit(?:ed)?(?:\s+with)?\s+(?:code|status)\s+(?!0\b)\d+/.test(value) ||
		/\b(sigsegv|sigabrt|sigkill|sigterm)\b/.test(value)
	) {
		return 'error'
	}

	const status = detectHttpStatus(message)
	if (status !== null) {
		const httpLevel = levelFromHttpStatus(status)
		if (httpLevel) return httpLevel
	}

	if (
		/\b(error|err|fatal|panic|exception|failed|refused|denied|timeout|unavailable)\b/.test(
			value
		)
	) {
		return 'error'
	}
	if (
		/\b(warn|warning|deprecated|retry|retrying|slow|throttl(?:e|ed|ing))\b/.test(
			value
		)
	) {
		return 'warn'
	}
	if (/\b(debug|trace|verbose)\b/.test(value)) {
		return 'debug'
	}
	return stream === 'stderr' ? 'warn' : 'info'
}

export function formatTimestamp(ts: string): string {
	try {
		return Temporal.Instant.from(ts)
			.toZonedDateTimeISO(Temporal.Now.timeZoneId())
			.toPlainTime()
			.toString({ smallestUnit: 'millisecond' })
	} catch {
		return ts
	}
}

/** Convierte las líneas a texto plano para copiar o descargar. */
export function serializeLogs(
	lines: LogLine[],
	options: { timestamps?: boolean } = {}
): string {
	const { timestamps = true } = options
	return lines
		.map((line) => {
			const prefix = timestamps ? `${line.ts} ` : ''
			const tag = line.stream === 'stderr' ? '[stderr] ' : ''
			return `${prefix}${tag}${line.message}`
		})
		.join('\n')
}

export function buildLogFileName(containerName: string): string {
	const stamp = Temporal.Now.instant()
		.toString({ smallestUnit: 'millisecond' })
		.replace(/[:.]/g, '-')
	const safeName = containerName.replace(/[^a-zA-Z0-9._-]/g, '_')
	return `${safeName}-${stamp}.log`
}
