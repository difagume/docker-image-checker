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

describe('i18n transient/refresh parity (fix-provider-robustness)', () => {
	it('defines container.transient in every dictionary with non-empty values', () => {
		for (const [locale, dict] of Object.entries(dictionaries)) {
			expect(
				dict.container.transient,
				`${locale}.container.transient`
			).toBeTypeOf('string')
			expect(dict.container.transient.length).toBeGreaterThan(0)
		}
	})

	it('no longer defines the dead container.checking key in any dictionary', () => {
		for (const [locale, dict] of Object.entries(dictionaries)) {
			expect(
				(dict.container as Record<string, unknown>).checking,
				`${locale}.container.checking`
			).toBeUndefined()
		}
	})

	it('defines the refresh accessibility keys in every dictionary', () => {
		for (const [locale, dict] of Object.entries(dictionaries)) {
			for (const key of [
				'refreshAriaLabel',
				'refreshing',
				'upToDate'
			] as const) {
				const value = dict.dashboard[key]
				expect(value, `${locale}.dashboard.${key}`).toBeTypeOf('string')
				expect(value.length, `${locale}.dashboard.${key}`).toBeGreaterThan(0)
			}
		}
	})

	it('uses non-English refresh strings in es and pt-BR', () => {
		expect(dictionaries.es.dashboard.refreshAriaLabel).not.toBe(
			dictionaries.en.dashboard.refreshAriaLabel
		)
		expect(dictionaries.pt.dashboard.refreshAriaLabel).not.toBe(
			dictionaries.en.dashboard.refreshAriaLabel
		)
	})
})
