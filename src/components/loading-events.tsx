'use client'

const LOADING_EVENT = 'docker-checker-loading-change'

interface LoadingEventDetail {
	isLoading: boolean
}

export function dispatchLoading(isLoading: boolean) {
	window.dispatchEvent(
		new CustomEvent<LoadingEventDetail>(LOADING_EVENT, {
			detail: { isLoading }
		})
	)
}

export function subscribeToLoading(
	callback: (isLoading: boolean) => void
): () => void {
	const handler = (event: CustomEvent<LoadingEventDetail>) => {
		callback(event.detail.isLoading)
	}

	window.addEventListener(LOADING_EVENT, handler as EventListener)

	return () => {
		window.removeEventListener(LOADING_EVENT, handler as EventListener)
	}
}
