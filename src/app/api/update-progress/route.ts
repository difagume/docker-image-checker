import type { NextRequest } from 'next/server'
import { progressStore, type UpdatePhase } from '@/lib/update-progress-store'

export const dynamic = 'force-dynamic'

interface ProgressEvent {
	phase: UpdatePhase
	statusText: string
	currentLayer?: number
	totalLayers?: number
	error?: string
	result?: {
		newContainerId?: string
		newImageId?: string
	}
}

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url)
	const taskId = searchParams.get('taskId')

	if (!taskId || !progressStore.getProgress(taskId)) {
		return new Response(JSON.stringify({ error: 'Task not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Narrowed const for use inside closures
	const resolvedTaskId: string = taskId

	// Per-task throttle tracking
	const throttleWindows = new Map<string, number[]>()
	const THROTTLE_LIMIT = 20
	const THROTTLE_WINDOW = 1000

	function isThrottled(): boolean {
		const now = Date.now()
		let timestamps = throttleWindows.get(resolvedTaskId)
		if (!timestamps) {
			timestamps = []
			throttleWindows.set(resolvedTaskId, timestamps)
		}
		while (timestamps.length > 0 && timestamps[0] < now - THROTTLE_WINDOW) {
			timestamps.shift()
		}
		if (timestamps.length >= THROTTLE_LIMIT) return true
		timestamps.push(now)
		return false
	}

	let lastSentEvent: string | null = null
	let closed = false

	const stream = new ReadableStream({
		start(controller) {
			const interval = setInterval(() => {
				if (closed) return

				const state = progressStore.getProgress(resolvedTaskId)
				if (!state) {
					controller.enqueue(
						`event: phase\ndata: ${JSON.stringify({
							phase: 'error',
							statusText: 'Task expired'
						})}\n\n`
					)
					controller.close()
					clearInterval(interval)
					closed = true
					return
				}

				const eventPayload: ProgressEvent = {
					phase: state.phase,
					statusText: state.statusText,
					...(state.currentLayer !== undefined
						? { currentLayer: state.currentLayer }
						: {}),
					...(state.totalLayers !== undefined
						? { totalLayers: state.totalLayers }
						: {}),
					...(state.error ? { error: state.error } : {}),
					...(state.result ? { result: state.result } : {})
				}

				const eventStr = JSON.stringify(eventPayload)

				// Don't resend the same state
				if (eventStr === lastSentEvent) return
				if (isThrottled()) return

				lastSentEvent = eventStr
				controller.enqueue(`event: phase\ndata: ${eventStr}\n\n`)

				if (state.phase === 'done' || state.phase === 'error') {
					clearInterval(interval)
					throttleWindows.delete(resolvedTaskId)
					closed = true
					controller.close()
				}
			}, 200)

			req.signal.addEventListener('abort', () => {
				clearInterval(interval)
				throttleWindows.delete(resolvedTaskId)
				closed = true
			})
		}
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	})
}
