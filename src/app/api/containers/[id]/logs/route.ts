import type { NextRequest } from 'next/server'
import docker from '@/lib/docker'
import { detectLevel, type LogLine, type LogStream } from '@/lib/docker-logs'
import { getSession } from '@/lib/session'

/**
 * Streaming de logs por SSE.
 *
 * GET /api/containers/:id/logs?tail=250
 *
 * La fuente real es el daemon de Docker vía dockerode: primero se pide el
 * histórico (equivalente al `tail` de docker logs) y después se sigue el
 * stream en vivo con `follow: true` desde el instante de conexión.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	// El proxy de autenticación excluye /api, así que se valida aquí.
	if (process.env.AUTH_HTPASSWD) {
		const session = await getSession()
		if (!session.isLoggedIn) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	const { id } = await params
	const tailParam = Number(request.nextUrl.searchParams.get('tail') ?? '250')
	const tail = Number.isFinite(tailParam)
		? Math.min(Math.max(Math.trunc(tailParam), 1), 5000)
		: 250

	const container = docker.getContainer(id)

	// Los contenedores con TTY no multiplexan stdout/stderr (sin cabecera de 8 bytes).
	let tty = false
	try {
		const info = await container.inspect()
		tty = Boolean(info.Config?.Tty)
	} catch {
		return new Response(JSON.stringify({ error: 'Container not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const encoder = new TextEncoder()
	let nextId = 1

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false
			let heartbeat: ReturnType<typeof setInterval> | undefined
			let liveStream: NodeJS.ReadableStream | undefined

			const send = (event: string, payload: unknown) => {
				if (closed) return
				controller.enqueue(
					encoder.encode(
						`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
					)
				)
			}

			const close = () => {
				if (closed) return
				closed = true
				if (heartbeat) clearInterval(heartbeat)
				;(liveStream as { destroy?: () => void } | undefined)?.destroy?.()
				try {
					controller.close()
				} catch {
					// El stream ya estaba cerrado por el cliente.
				}
			}

			request.signal.addEventListener('abort', close)

			const toLine = (raw: RawLogEvent): LogLine => ({
				id: nextId++,
				ts: raw.ts,
				stream: raw.stream,
				level: detectLevel(raw.message, raw.stream),
				message: raw.message
			})

			try {
				// Histórico inicial (equivalente al `tail` de docker logs).
				const since = Date.now() / 1000
				const historyBuffer = (await container.logs({
					follow: false,
					stdout: true,
					stderr: true,
					timestamps: true,
					tail
				})) as unknown as Buffer

				const history: RawLogEvent[] = []
				const collectHistory = createLogParser(tty, (raw) => history.push(raw))
				collectHistory.push(historyBuffer)
				collectHistory.flush()

				send('history', history.map(toLine))
				send('ready', { containerId: id, tail })

				// Comentario periódico para mantener viva la conexión tras proxies.
				heartbeat = setInterval(() => {
					if (closed) return
					controller.enqueue(encoder.encode(': ping\n\n'))
				}, 15000)

				// Seguimiento en vivo desde el instante de la petición de histórico.
				liveStream = (await container.logs({
					follow: true,
					stdout: true,
					stderr: true,
					timestamps: true,
					since
				})) as NodeJS.ReadableStream

				const pushLive = createLogParser(tty, (raw) => send('log', toLine(raw)))

				liveStream.on('data', (chunk: Buffer) => {
					if (closed) return
					pushLive.push(chunk)
				})
				liveStream.on('error', () => {
					send('failed', { message: 'Se perdió la conexión con el contenedor' })
					close()
				})
				liveStream.on('end', () => {
					pushLive.flush()
					close()
				})
			} catch {
				send('failed', { message: 'Se perdió la conexión con el contenedor' })
				close()
			}
		}
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	})
}

type RawLogEvent = { ts: string; stream: LogStream; message: string }

/**
 * Extrae el timestamp que antepone Docker (`timestamps: true`) y devuelve el
 * evento crudo de log. Si la línea no tiene timestamp, se usa el actual.
 */
function parseLine(stream: LogStream, line: string): RawLogEvent {
	const match = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s?(.*)$/)
	if (match) {
		return { ts: match[1], stream, message: match[2] }
	}
	return { ts: new Date().toISOString(), stream, message: line }
}

/**
 * Crea un parser incremental que decodifica el multiplexado de Docker
 * (cabecera de 8 bytes: [streamType, 0,0,0, size(uint32be)]) y emite una
 * línea completa por cada salto de línea. En modo TTY no hay multiplexado,
 * así que todo el flujo se trata como stdout.
 */
function createLogParser(tty: boolean, emit: (raw: RawLogEvent) => void) {
	let frameBuffer = Buffer.alloc(0)
	const remainders: Record<LogStream, string> = { stdout: '', stderr: '' }

	const pushText = (stream: LogStream, text: string) => {
		remainders[stream] += text
		let index = remainders[stream].indexOf('\n')
		while (index !== -1) {
			const line = remainders[stream].slice(0, index).replace(/\r$/, '')
			remainders[stream] = remainders[stream].slice(index + 1)
			if (line.length > 0) emit(parseLine(stream, line))
			index = remainders[stream].indexOf('\n')
		}
	}

	const push = (chunk: Buffer) => {
		if (tty) {
			pushText('stdout', chunk.toString('utf8'))
			return
		}

		frameBuffer = Buffer.concat([frameBuffer, chunk])
		while (frameBuffer.length >= 8) {
			const size = frameBuffer.readUInt32BE(4)
			if (frameBuffer.length < 8 + size) break
			const streamType: LogStream = frameBuffer[0] === 2 ? 'stderr' : 'stdout'
			pushText(streamType, frameBuffer.subarray(8, 8 + size).toString('utf8'))
			frameBuffer = frameBuffer.subarray(8 + size)
		}
	}

	const flush = () => {
		for (const stream of ['stdout', 'stderr'] as const) {
			if (remainders[stream].length > 0) {
				emit(parseLine(stream, remainders[stream].replace(/\r$/, '')))
				remainders[stream] = ''
			}
		}
	}

	return { push, flush }
}
