'use client'

/**
 * Client-side store that broadcasts the refresh loading state.
 *
 * Two independent sources feed into it:
 *  - `formPending`: the server action (`revalidatePath`) triggered by the
 *    refresh button. This phase is not measurable (indeterminate).
 *  - `check` progress: the background image-update check, which reports real
 *    `current`/`total` values.
 *
 * The refresh button uses it to know when to disable itself, and the top
 * progress bar (`RefreshProgressBar`) uses it to drive `@bprogress/next`.
 */

export interface RefreshState {
	formPending: boolean
	checkCurrent: number
	checkTotal: number
}

let state: RefreshState = {
	formPending: false,
	checkCurrent: 0,
	checkTotal: 0
}

const listeners = new Set<(state: RefreshState) => void>()

function emit() {
	for (const listener of listeners) {
		listener(state)
	}
}

/** Report the server-action (revalidatePath) pending state. */
export function setFormPending(formPending: boolean) {
	if (state.formPending === formPending) return
	state = { ...state, formPending }
	emit()
}

/** Report the background image-update check progress. */
export function setCheckProgress(current: number, total: number) {
	if (state.checkCurrent === current && state.checkTotal === total) return
	state = { ...state, checkCurrent: current, checkTotal: total }
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
