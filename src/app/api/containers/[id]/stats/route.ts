import type { NextRequest } from 'next/server'
import docker from '@/lib/docker'
import { type RawDockerStats, toStatsSample } from '@/lib/docker-stats'
import { getSession } from '@/lib/session'

/**
 * Streaming de métricas por SSE.
 *
 * GET /api/containers/:id/stats
 *
 * La fuente real es el daemon de Docker vía dockerode con
 * `container.stats({ stream: true })`: el daemon emite una muestra JSON por
 * segundo y aquí se convierte cada una a un `StatsSample` (CPU %, memoria,
 * red, disco) para que el cliente solo reciba números ya calculados.
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
	const container = docker.getContainer(id)

	try {
		await container.inspect()
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
			// Resto parcial de la última muestra recibida del daemon.
			let buffer = ''

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

			try {
				send('ready', { containerId: id })

				// Comentario periódico para mantener viva la conexión tras proxies.
				heartbeat = setInterval(() => {
					if (closed) return
					controller.enqueue(encoder.encode(': ping\n\n'))
				}, 15000)

				liveStream = (await container.stats({
					stream: true
				})) as unknown as NodeJS.ReadableStream

				liveStream.on('data', (chunk: Buffer) => {
					if (closed) return
					// El daemon emite un JSON por chunk; los chunks pueden venir
					// partidos, así que se acumula hasta un JSON completo.
					buffer += chunk.toString('utf8')
					let newlineIndex = buffer.indexOf('\n')
					while (newlineIndex !== -1) {
						const line = buffer.slice(0, newlineIndex).trim()
						buffer = buffer.slice(newlineIndex + 1)
						if (line.length > 0) {
							try {
								const sample = toStatsSample(
									JSON.parse(line) as RawDockerStats,
									nextId++
								)
								if (sample) send('stats', sample)
							} catch {
								// Línea corrupta: se descarta y se sigue con la siguiente.
							}
						}
						newlineIndex = buffer.indexOf('\n')
					}
				})
				liveStream.on('error', () => {
					send('failed', { message: 'Se perdió la conexión con el daemon' })
					close()
				})
				liveStream.on('end', close)
			} catch {
				send('failed', { message: 'Se perdió la conexión con el daemon' })
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
