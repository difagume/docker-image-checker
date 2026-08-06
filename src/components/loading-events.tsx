'use client'

/**
 * Client-side store that broadcasts the refresh loading state.
 *
 * The only source is the server action (`revalidatePath`) pending state
 * reported by the refresh button via `useFormStatus().pending`.
 */

export interface RefreshState {
	formPending: boolean
}

let state: RefreshState = { formPending: false }

const listeners = new Set<(state: RefreshState) => void>()

function emit() {
	for (const listener of listeners) {
		listener(state)
	}
}

/** Report the server-action pending state. */
export function setFormPending(formPending: boolean) {
	if (state.formPending === formPending) return
	state = { ...state, formPending }
	emit()
}

/** Subscribe to refresh state changes. The callback fires immediately with the current state. */
export function subscribeRefreshState(
	callback: (state: RefreshState) => void
): () => void {
	listeners.add(callback)
	callback(state)

	return () => {
		listeners.delete(callback)
	}
}
