import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEND_DEADLINE_DEFAULT_MS, withDeadline } from './send-deadline'

describe('withDeadline', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('resolves the wrapped value when the promise settles under the deadline', async () => {
		const fast = new Promise<string>((resolve) => {
			setTimeout(() => resolve('sent'), 100)
		})

		const result = withDeadline(fast, 5000, 'mock')
		await vi.advanceTimersByTimeAsync(100)

		await expect(result).resolves.toBe('sent')
	})

	it('rejects after the deadline when the promise never settles', async () => {
		const hung = new Promise<string>(() => {})

		const result = withDeadline(hung, 5000, 'mock')
		const assertion = expect(result).rejects.toThrow(
			'Send via mock timed out after 5000ms'
		)
		await vi.advanceTimersByTimeAsync(5000)
		await assertion
	})

	it('uses NOTIFICATIONS_SEND_TIMEOUT_MS as the default deadline', async () => {
		vi.stubEnv('NOTIFICATIONS_SEND_TIMEOUT_MS', '250')

		const hung = new Promise<string>(() => {})
		const result = withDeadline(hung, undefined, 'mock')
		const assertion = expect(result).rejects.toThrow(
			'Send via mock timed out after 250ms'
		)
		await vi.advanceTimersByTimeAsync(250)
		await assertion
	})

	it('falls back to 8000ms when the env var is unset', async () => {
		vi.stubEnv('NOTIFICATIONS_SEND_TIMEOUT_MS', '')

		const hung = new Promise<string>(() => {})
		const result = withDeadline(hung, undefined, 'mock')
		const assertion = expect(result).rejects.toThrow(
			'Send via mock timed out after 8000ms'
		)
		await vi.advanceTimersByTimeAsync(SEND_DEADLINE_DEFAULT_MS)
		await assertion
	})

	it('rejects with the original reason when the promise rejects before the deadline', async () => {
		const failing = new Promise<string>((_, reject) => {
			setTimeout(() => reject(new Error('boom')), 100)
		})

		const result = withDeadline(failing, 5000, 'mock')
		const assertion = expect(result).rejects.toThrow('boom')
		await vi.advanceTimersByTimeAsync(100)
		await assertion
	})
})
