/**
 * Cache revalidation tunnel for callers that run OUTSIDE the App Router
 * request context (the Telegram polling path). `updateTag`/`revalidateTag`
 * throw without a request work store (E872/E263, source-verified), so the
 * polling path loopback-fetches the internal `/api/internal/revalidate`
 * route instead. Failures are swallowed with a fallback to natural
 * `cacheLife` expiry and the scheduler's raw readers (R12.2).
 */

const NONCE_GLOBAL_KEY = '__docker_revalidate_nonce__'
const TUNNEL_TIMEOUT_MS = 10_000

/**
 * In-process nonce shared between the polling path and the internal route.
 * Stored on `globalThis` (same pattern as `progressStore`) so both sides of
 * the tunnel agree even when Turbopack/webpack instantiate the shared lib
 * more than once per process (D9).
 */
export function getRevalidateNonce(): string {
	const g = globalThis as unknown as Record<string, string | undefined>
	let nonce = g[NONCE_GLOBAL_KEY]
	if (!nonce) {
		nonce = crypto.randomUUID()
		g[NONCE_GLOBAL_KEY] = nonce
	}
	return nonce
}

/**
 * Loopback URL for the internal revalidation route. Overridable via
 * `INTERNAL_REVALIDATE_URL` (full route URL) for setups where the app does
 * not listen on 127.0.0.1 (e.g. a remote/in-container host that resolves
 * itself differently). Defaults to `http://127.0.0.1:${PORT|3000}/api/internal/revalidate`.
 */
export function getInternalRevalidateUrl(): string {
	const override = process.env.INTERNAL_REVALIDATE_URL?.trim()
	if (override) {
		return override.replace(/\/+$/, '')
	}
	const port = process.env.PORT || '3000'
	return `http://127.0.0.1:${port}/api/internal/revalidate`
}

/**
 * Asks the internal route to expire the given cache tags immediately.
 * Never throws — on any failure it logs and returns false so the caller can
 * fall back to natural cache expiry (R12.2).
 */
export async function requestRevalidation(
	tags: readonly string[]
): Promise<boolean> {
	try {
		const response = await fetch(getInternalRevalidateUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-revalidate-nonce': getRevalidateNonce()
			},
			body: JSON.stringify({ tags }),
			signal: AbortSignal.timeout(TUNNEL_TIMEOUT_MS)
		})

		if (!response.ok) {
			console.warn(
				`[revalidate-tunnel] route rejected revalidation (${response.status})`
			)
			return false
		}

		return true
	} catch (error) {
		console.error(
			'[revalidate-tunnel] revalidation request failed, falling back to natural cache expiry:',
			error
		)
		return false
	}
}
