import type { UpdatePhase } from '@/lib/update-progress-store'

export interface UpdateProgressData {
	phase: UpdatePhase
	statusText: string
	error?: string
	result?: { newContainerId?: string; newImageId?: string }
}

export interface UpdateProgressHandlers {
	onPhase: (data: UpdateProgressData) => void
	/** Connection-level failure (stream dropped), not a phase error. */
	onConnectionError: () => void
}

/**
 * Opens the SSE stream for a container update task started by
 * `triggerContainerUpdate`. The caller owns closing the returned EventSource.
 */
export function connectUpdateProgress(
	taskId: string,
	{ onPhase, onConnectionError }: UpdateProgressHandlers
): EventSource {
	const eventSource = new EventSource(`/api/update-progress?taskId=${taskId}`)

	eventSource.addEventListener('phase', (event: MessageEvent) => {
		onPhase(JSON.parse(event.data as string) as UpdateProgressData)
	})

	eventSource.addEventListener('error', () => {
		onConnectionError()
	})

	return eventSource
}
