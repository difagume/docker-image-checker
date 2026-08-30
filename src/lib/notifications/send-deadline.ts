/**
 * Per-send deadline for notification provider dispatch (B-08).
 *
 * A hung provider endpoint (accepts the request but never responds) must not
 * freeze a scheduler check round. `withDeadline` races the send promise
 * against a rejection timer; the timer is cleared as soon as the send settles
 * so nothing leaks. Telegram (node-telegram-bot-api) has no AbortSignal
 * support, so the boundary wrap here is the only viable spot for it.
 */

export const SEND_DEADLINE_DEFAULT_MS = 8000

export function getSendDeadlineMs(): number {
	const raw = Number(process.env.NOTIFICATIONS_SEND_TIMEOUT_MS)
	if (!raw || Number.isNaN(raw) || raw <= 0) {
		return SEND_DEADLINE_DEFAULT_MS
	}
	return raw
}

export function withDeadline<T>(
	promise: Promise<T>,
	ms: number | undefined,
	label: string
): Promise<T> {
	const timeout = ms ?? getSendDeadlineMs()

	let timer: ReturnType<typeof setTimeout> | undefined

	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Send via ${label} timed out after ${timeout}ms`)),
			timeout
		)
	})

	// Clear the timer as soon as the send settles so nothing leaks.
	const settle = () => {
		if (timer) clearTimeout(timer)
	}
	promise.then(settle, settle)

	return Promise.race([promise, deadline])
}
