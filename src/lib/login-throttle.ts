import { createRateLimiter } from './rate-limit'

const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60_000

const limiter = createRateLimiter('login-attempts', {
	limit: MAX_FAILURES,
	windowMs: WINDOW_MS
})

export function loginRetryAfterSeconds(
	key: string,
	now = Date.now()
): number | null {
	const decision = limiter.check(key, now)
	return decision.allowed ? null : decision.retryAfterSeconds
}

export function recordLoginFailure(key: string, now = Date.now()): void {
	limiter.consume(key, now)
}

export function clearLoginFailures(key: string): void {
	limiter.reset(key)
}
