import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	getTelegramPollingStatus,
	initTelegramPolling,
	parseAllowedChatIds
} from './telegram-polling'

describe('parseAllowedChatIds (R13)', () => {
	it('parses a single chat id', () => {
		expect([...parseAllowedChatIds('123456789')]).toEqual(['123456789'])
	})

	it('parses comma-separated ids and trims whitespace', () => {
		const set = parseAllowedChatIds(' 123456789, @mychannel ,987654321 ')
		expect([...set]).toEqual(['123456789', '@mychannel', '987654321'])
	})

	it('ignores empty segments', () => {
		expect([...parseAllowedChatIds('123,,456,')]).toEqual(['123', '456'])
	})

	it('returns an empty set for undefined or empty input', () => {
		expect(parseAllowedChatIds(undefined).size).toBe(0)
		expect(parseAllowedChatIds('').size).toBe(0)
		expect(parseAllowedChatIds('   ').size).toBe(0)
	})
})

describe('initTelegramPolling env gate (R4.2)', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('never starts when notifications are disabled', () => {
		vi.stubEnv('NEXT_RUNTIME', 'nodejs')
		vi.stubEnv('NOTIFICATIONS_ENABLED', 'false')
		vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token')
		vi.stubEnv('TELEGRAM_CHAT_ID', '123')

		initTelegramPolling()

		expect(getTelegramPollingStatus().running).toBe(false)
	})

	it('never starts without a bot token', () => {
		vi.stubEnv('NEXT_RUNTIME', 'nodejs')
		vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
		vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
		vi.stubEnv('TELEGRAM_CHAT_ID', '123')

		initTelegramPolling()

		expect(getTelegramPollingStatus().running).toBe(false)
	})

	it('never starts without a chat id', () => {
		vi.stubEnv('NEXT_RUNTIME', 'nodejs')
		vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
		vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token')
		vi.stubEnv('TELEGRAM_CHAT_ID', '')

		initTelegramPolling()

		expect(getTelegramPollingStatus().running).toBe(false)
	})

	it('reports enabled only when all required env vars are present', () => {
		vi.stubEnv('NEXT_RUNTIME', 'nodejs')
		vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
		vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token')
		vi.stubEnv('TELEGRAM_CHAT_ID', '123')

		expect(getTelegramPollingStatus().enabled).toBe(true)

		vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
		expect(getTelegramPollingStatus().enabled).toBe(false)
	})
})
