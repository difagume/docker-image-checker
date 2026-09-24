/**
 * Identification for the server's `ContainerUpdateInProgressError`
 * (`src/lib/container-update-task.ts`) on the client side.
 *
 * The constants are duplicated here instead of importing the error class
 * because this module is consumed by the client bundle: importing the class
 * would drag the Docker update pipeline (dockerode, notifications) into
 * browser code. `container-update-task.ts` imports these same constants so
 * both sides cannot drift apart.
 */

/** Mirrors `ContainerUpdateInProgressError.digest`; survives production flight. */
export const UPDATE_IN_PROGRESS_DIGEST = 'container-update-in-progress'

/** Mirrors `ContainerUpdateInProgressError.name`; survives development flight. */
export const UPDATE_IN_PROGRESS_ERROR_NAME = 'ContainerUpdateInProgressError'

/** Mirrors `ContainerUpdateInProgressError.message`. */
export const UPDATE_IN_PROGRESS_MESSAGE = 'Container update already in progress'

/**
 * True when a rejection from `triggerContainerUpdate` means "a server task is
 * already running for this container" — an expected duplicate trigger, not a
 * failed update.
 *
 * Transport notes (react-server-dom flight serialization, verified against
 * the compiled Next.js runtime):
 * - Production server actions redact `name`/`message` and deliver only
 *   `{ digest }`, so the pre-set digest is the primary marker.
 * - Development preserves `name`/`message` (and digest), so those also match
 *   there and in same-process/unit-test contexts.
 * - A `false` result does not prove a genuine failure (the payload may have
 *   been re-wrapped); callers must corroborate against the server's
 *   active-task list before destroying client progress state.
 */
export function isContainerUpdateInProgressError(err: unknown): boolean {
	if (!(err instanceof Error)) return false
	const { digest } = err as Error & { digest?: unknown }
	if (digest === UPDATE_IN_PROGRESS_DIGEST) return true
	// Exact message comparison: a substring match would misclassify any
	// unrelated error that merely quotes the phrase.
	return (
		err.name === UPDATE_IN_PROGRESS_ERROR_NAME ||
		err.message === UPDATE_IN_PROGRESS_MESSAGE
	)
}
