import { describe, expect, it } from 'vitest'
import {
	isContainerUpdateInProgressError,
	UPDATE_IN_PROGRESS_DIGEST,
	UPDATE_IN_PROGRESS_ERROR_NAME,
	UPDATE_IN_PROGRESS_MESSAGE
} from './update-in-progress'

describe('isContainerUpdateInProgressError', () => {
	it('matches the production flight marker (digest only)', () => {
		// Production server actions redact name/message; only `digest` arrives
		// on the reconstructed client error.
		const err = Object.assign(new Error('Server Actions error'), {
			digest: UPDATE_IN_PROGRESS_DIGEST
		})
		expect(isContainerUpdateInProgressError(err)).toBe(true)
	})

	it('matches the serialized class name (development flight)', () => {
		const err = new Error('some message')
		err.name = UPDATE_IN_PROGRESS_ERROR_NAME
		expect(isContainerUpdateInProgressError(err)).toBe(true)
	})

	it('matches the stable message marker (same-process callers)', () => {
		expect(
			isContainerUpdateInProgressError(new Error(UPDATE_IN_PROGRESS_MESSAGE))
		).toBe(true)
	})

	it('rejects messages that only contain the marker phrase', () => {
		expect(
			isContainerUpdateInProgressError(
				new Error(`upstream failed: "${UPDATE_IN_PROGRESS_MESSAGE}" (retrying)`)
			)
		).toBe(false)
	})

	it('rejects unrelated errors and non-error values', () => {
		expect(isContainerUpdateInProgressError(new Error('Docker is down'))).toBe(
			false
		)
		expect(isContainerUpdateInProgressError(UPDATE_IN_PROGRESS_MESSAGE)).toBe(
			false
		)
		expect(isContainerUpdateInProgressError(undefined)).toBe(false)
	})
})
