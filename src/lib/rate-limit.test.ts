import { describe, expect, it } from 'vitest'

import { createRateLimiter } from './rate-limit'

const WINDOW_MS = 60_000

describe('createRateLimiter', () => {
	it('allows requests up to the limit and blocks the next one', () => {
		const limiter = createRateLimiter('test-limit', {
			limit: 3,
			windowMs: WINDOW_MS
		})
		const now = 1_000

		expect(limiter.consume('a', now).allowed).toBe(true)
		expect(limiter.consume('a', now).allowed).toBe(true)
		expect(limiter.consume('a', now).allowed).toBe(true)
		expect(limiter.consume('a', now).allowed).toBe(false)
	})

	it('returns a positive retry-after while the window is open', () => {
		const limiter = createRateLimiter('test-retry', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const now = 5_000

		limiter.consume('a', now)
		const decision = limiter.consume('a', now + 15_000)

		expect(decision.allowed).toBe(false)
		expect(decision.retryAfterSeconds).toBe(45)
	})

	it('resets the counter once the window has elapsed', () => {
		const limiter = createRateLimiter('test-window', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const now = 0

		limiter.consume('a', now)
		expect(limiter.consume('a', now + 10).allowed).toBe(false)
		expect(limiter.consume('a', now + WINDOW_MS + 1).allowed).toBe(true)
	})

	it('does not consume on check', () => {
		const limiter = createRateLimiter('test-check', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const now = 0

		expect(limiter.check('a', now).allowed).toBe(true)
		expect(limiter.check('a', now).allowed).toBe(true)
		expect(limiter.consume('a', now).allowed).toBe(true)
		expect(limiter.check('a', now).allowed).toBe(false)
	})

	it('tracks keys independently and clears them on reset', () => {
		const limiter = createRateLimiter('test-reset', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const now = 0

		limiter.consume('a', now)
		expect(limiter.check('a', now).allowed).toBe(false)
		expect(limiter.check('b', now).allowed).toBe(true)

		limiter.reset('a')
		expect(limiter.check('a', now).allowed).toBe(true)
	})

	it('shares state between instances created with the same name', () => {
		const first = createRateLimiter('test-shared', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const second = createRateLimiter('test-shared', {
			limit: 1,
			windowMs: WINDOW_MS
		})
		const now = 0

		first.consume('a', now)
		expect(second.check('a', now).allowed).toBe(false)
	})
})
