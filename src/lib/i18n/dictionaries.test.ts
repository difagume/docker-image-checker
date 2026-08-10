import { describe, expect, it } from 'vitest'
import { dictionaries } from './dictionaries'

const UPDATE_KEYS = [
	'update',
	'updating',
	'updateStatusSuccess',
	'updateStatusError',
	'updateStatusAlready'
] as const

describe('i18n notification update-key parity (R14.2)', () => {
	it('defines all five update* keys in every dictionary with non-empty values', () => {
		for (const [locale, dict] of Object.entries(dictionaries)) {
			const notifications = dict.notifications
			for (const key of UPDATE_KEYS) {
				expect(notifications[key], `${locale}.notifications.${key}`).toBeTypeOf(
					'string'
				)
				expect(
					notifications[key].length,
					`${locale}.notifications.${key}`
				).toBeGreaterThan(0)
			}
		}
	})
})
