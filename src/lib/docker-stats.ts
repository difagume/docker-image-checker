/**
 * Tipos y cálculos puros sobre el stream de `GET /containers/:id/stats` de
 * Docker. El daemon emite una muestra JSON por segundo; aquí se convierte cada
 * muestra cruda en un punto de métrica (CPU %, memoria, red, disco) igual que
 * hace `docker stats`. Las funciones son puras para poder testearlas sin
 * conexión al daemon.
 */

export type StatsStatus = 'idle' | 'connecting' | 'live' | 'error' | 'closed'

/** Número máximo de muestras que se mantienen en el cliente para las gráficas. */
export const MAX_SAMPLES = 120

export type StatsSample = {
	/** Identificador incremental dentro de la sesión de streaming. */
	id: number
	/** Instante de la muestra (epoch ms). */
	ts: number
	/** Uso de CPU en porcentaje (0–100, relativo a un solo núcleo). */
	cpuPercent: number
	/** Memoria en uso, en bytes. */
	memUsage: number
	/** Límite de memoria, en bytes. */
	memLimit: number
	/** Uso de memoria en porcentaje (0–100). */
	memPercent: number
	/** Total recibido por red, en bytes (acumulado del contenedor). */
	netRx: number
	/** Total enviado por red, en bytes. */
	netTx: number
	/** Total leído de disco, en bytes. */
	blockRead: number
	/** Total escrito a disco, en bytes. */
	blockWrite: number
}

/** Subconjunto del JSON crudo de Docker que usamos (campos opcionales a propósito). */
export interface RawDockerStats {
	read?: string
	cpu_stats?: {
		cpu_usage?: { total_usage?: number; percpu_usage?: number[] }
		system_cpu_usage?: number
		online_cpus?: number
	}
	precpu_stats?: {
		cpu_usage?: { total_usage?: number }
		system_cpu_usage?: number
	}
	memory_stats?: {
		usage?: number
		limit?: number
		stats?: { cache?: number; inactive_file?: number }
	}
	networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>
	blkio_stats?: {
		io_service_bytes_recursive?: {
			op?: string
			major?: number
			value?: number
		}[]
	}
}

/**
 * Porcentaje de CPU entre dos muestras consecutivas, con la fórmula de
 * `docker stats`: delta de CPU del contenedor sobre delta de CPU del sistema,
 * normalizado por número de núcleos.
 */
export function computeCpuPercent(raw: RawDockerStats): number {
	const cpu = raw.cpu_stats?.cpu_usage?.total_usage
	const system = raw.cpu_stats?.system_cpu_usage
	const preCpu = raw.precpu_stats?.cpu_usage?.total_usage
	const preSystem = raw.precpu_stats?.system_cpu_usage

	if (
		typeof cpu !== 'number' ||
		typeof system !== 'number' ||
		typeof preCpu !== 'number' ||
		typeof preSystem !== 'number'
	) {
		return 0
	}

	const cpuDelta = cpu - preCpu
	const systemDelta = system - preSystem
	if (cpuDelta <= 0 || systemDelta <= 0) return 0

	const onlineCpus = raw.cpu_stats?.online_cpus
	const cores =
		typeof onlineCpus === 'number' && onlineCpus > 0
			? onlineCpus
			: (raw.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1)

	return (cpuDelta / systemDelta) * cores * 100
}

/**
 * Memoria en uso. En cgroups v2 el kernel incluye la caché de archivos en
 * `usage`, igual que hace `docker stats` al restarla (`inactive_file` con
 * v2, `cache` con v1).
 */
export function computeMemoryUsage(raw: RawDockerStats): number {
	const usage = raw.memory_stats?.usage
	if (typeof usage !== 'number') return 0

	const cache = raw.memory_stats?.stats?.cache
	const inactiveFile = raw.memory_stats?.stats?.inactive_file
	const discount =
		typeof inactiveFile === 'number' && inactiveFile > 0
			? inactiveFile
			: typeof cache === 'number'
				? cache
				: 0

	return Math.max(usage - discount, 0)
}

function sumNetwork(raw: RawDockerStats): { rx: number; tx: number } {
	let rx = 0
	let tx = 0
	for (const iface of Object.values(raw.networks ?? {})) {
		rx += iface.rx_bytes ?? 0
		tx += iface.tx_bytes ?? 0
	}
	return { rx, tx }
}

function sumBlockIo(raw: RawDockerStats): { read: number; write: number } {
	let read = 0
	let write = 0
	for (const entry of raw.blkio_stats?.io_service_bytes_recursive ?? []) {
		const value = entry.value ?? 0
		if (entry.op === 'Read') read += value
		if (entry.op === 'Write') write += value
	}
	return { read, write }
}

/**
 * Convierte una muestra cruda del daemon en un punto de métrica. Devuelve
 * `null` si la muestra no trae lectura válida (p. ej. el daemon la vació al
 * parar el contenedor).
 */
export function toStatsSample(
	raw: RawDockerStats,
	id: number
): StatsSample | null {
	if (!raw.cpu_stats && !raw.memory_stats) return null

	const memUsage = computeMemoryUsage(raw)
	const memLimit = raw.memory_stats?.limit ?? 0
	const { rx, tx } = sumNetwork(raw)
	const { read, write } = sumBlockIo(raw)

	return {
		id,
		ts: raw.read ? Date.parse(raw.read) || Date.now() : Date.now(),
		cpuPercent: computeCpuPercent(raw),
		memUsage,
		memLimit,
		memPercent: memLimit > 0 ? (memUsage / memLimit) * 100 : 0,
		netRx: rx,
		netTx: tx,
		blockRead: read,
		blockWrite: write
	}
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

/** Formatea bytes en unidades binarias (estilo `docker stats`). */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
	const exponent = Math.min(
		Math.floor(Math.log2(bytes) / 10),
		BYTE_UNITS.length - 1
	)
	const value = bytes / 2 ** (exponent * 10)
	const digits = value >= 100 || exponent === 0 ? 0 : 1
	return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

/** Formatea un porcentaje con un decimal. */
export function formatPercent(percent: number): string {
	if (!Number.isFinite(percent) || percent <= 0) return '0.0%'
	return `${percent.toFixed(1)}%`
}

/**
 * Genera los puntos de una polilínea SVG a partir de una serie de valores,
 * normalizada al máximo de la serie (no a 100) para que la forma sea
 * proporcional al pico reciente. Devuelve `null` con menos de 2 puntos.
 */
export function sparklinePoints(
	values: number[],
	width = 100,
	height = 24
): string | null {
	if (values.length < 2) return null

	const max = Math.max(...values)
	const peak = max > 0 ? max : 1
	const step = width / (values.length - 1)

	return values
		.map((value, index) => {
			const x = index * step
			const y = height - (Math.max(value, 0) / peak) * (height - 2) - 1
			return `${x.toFixed(1)},${y.toFixed(1)}`
		})
		.join(' ')
}
