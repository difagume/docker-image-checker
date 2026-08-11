import type { CallbackQuery } from 'node-telegram-bot-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	docker: {
		getContainer: vi.fn()
	},
	core: {
		runContainerUpdateTask: vi.fn()
	},
	callbacks: {
		getCallbackData: vi.fn(),
		removeCallbackData: vi.fn()
	},
	tunnel: {
		requestRevalidation: vi.fn()
	}
}))

vi.mock('@/lib/docker', () => ({ default: mocks.docker }))
vi.mock('@/lib/container-update-task', () => mocks.core)
vi.mock('./notification-callbacks', () => mocks.callbacks)
vi.mock('./revalidate-tunnel', () => mocks.tunnel)

import {
	type CallbackBot,
	getTelegramPollingStatus,
	handleCallbackQuery,
	initTelegramPolling,
	parseAllowedChatIds,
	setAllowedChatIds
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

describe('handleCallbackQuery with a mock bot (R5, R8, R9, R13)', () => {
	let bot: {
		editMessageText: ReturnType<typeof vi.fn>
		answerCallbackQuery: ReturnType<typeof vi.fn>
	}

	const CHAT_ID = 123456789
	const MESSAGE_ID = 7
	const SHORT_ID = 'abc12345'

	function inspectReturns(image: string) {
		mocks.docker.getContainer.mockReturnValue({
			inspect: vi.fn().mockResolvedValue({ Config: { Image: image } })
		})
	}

	function baseCallback(overrides: Record<string, unknown> = {}) {
		return {
			containerId: 'deadbeefcafe',
			fullImageName: 'nginx:1.2.3',
			locale: 'en',
			createdAt: Date.now(),
			containerName: 'web',
			imageName: 'nginx',
			currentVersion: '1.0.0',
			latestVersion: '1.2.3',
			dockerHubUrl: 'https://hub.docker.com/r/nginx',
			lastUpdated: '2026-01-01T10:00:00Z',
			chatId: CHAT_ID,
			messageId: MESSAGE_ID,
			...overrides
		}
	}

	function makeQuery(overrides: Partial<CallbackQuery> = {}): CallbackQuery {
		return {
			id: 'query-1',
			from: { id: 1, is_bot: false, first_name: 't' },
			message: {
				message_id: MESSAGE_ID,
				date: 0,
				chat: { id: CHAT_ID, type: 'private' }
			},
			data: `u:${SHORT_ID}`,
			...overrides
		} as unknown as CallbackQuery
	}

	function editTexts(): string[] {
		return (bot.editMessageText.mock.calls as [string, unknown][]).map(
			(call) => call[0]
		)
	}

	beforeEach(() => {
		setAllowedChatIds([String(CHAT_ID)])
		vi.clearAllMocks()
		mocks.callbacks.getCallbackData.mockResolvedValue(baseCallback())
		mocks.callbacks.removeCallbackData.mockResolvedValue(undefined)
		mocks.core.runContainerUpdateTask.mockImplementation(async () => ({
			taskId: 'task-1',
			done: Promise.resolve({
				success: true
			})
		}))
		bot = {
			editMessageText: vi.fn().mockResolvedValue(true),
			answerCallbackQuery: vi.fn().mockResolvedValue(true)
		}
	})

	afterEach(() => {
		setAllowedChatIds([])
	})

	it('keeps the original info visible on every edit and shows the updating status first (R5.1)', async () => {
		inspectReturns('nginx:1.0.0')

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const texts = editTexts()
		expect(texts.length).toBeGreaterThanOrEqual(2)
		for (const text of texts) {
			expect(text).toContain('web')
			expect(text).toContain('nginx')
		}
		expect(texts[0]).toContain('🔄')
		expect(texts[0]).toContain('Updating...')
	})

	it('shows the localized phase below the info block during progress (R14.1)', async () => {
		inspectReturns('nginx:1.0.0')
		mocks.core.runContainerUpdateTask.mockImplementation(
			async (_containerId: string, _image: string, opts: unknown) => {
				const onPhase = (opts as { onPhase?: (p: string, d?: unknown) => void })
					.onPhase
				onPhase?.('pulling', {
					layerProgress: { currentLayer: 1, totalLayers: 3 }
				})
				return {
					taskId: 'task-1',
					done: Promise.resolve({
						success: true
					})
				}
			}
		)

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const texts = editTexts()
		expect(texts.some((text) => text.includes('Pulling image... 1/3'))).toBe(
			true
		)
		expect(texts.some((text) => text.includes('web'))).toBe(true)
	})

	it('keeps the ORIGINAL info block on success and clears the keyboard', async () => {
		inspectReturns('nginx:1.0.0')

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const calls = bot.editMessageText.mock.calls as [
			string,
			{ reply_markup?: { inline_keyboard: unknown[] } }
		][]
		const lastText = calls[calls.length - 1][0]
		const lastOptions = calls[calls.length - 1][1]

		expect(lastText).toContain('✅')
		expect(lastText).toContain('Update completed')
		expect(lastText).toContain('web')
		// The info block is NEVER rebuilt: the persisted pre-update values stay
		// verbatim (current = origin, latest = target, original timestamp) and
		// only the status below changes.
		expect(lastText).toContain('`1.0.0`')
		expect(lastText).toContain('`1.2.3`')
		expect(lastText).toContain('*Updated:*')
		expect(lastText).toContain(
			Temporal.Instant.from(baseCallback().lastUpdated).toLocaleString('en', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			})
		)
		expect(lastOptions.reply_markup).toEqual({ inline_keyboard: [] })
		expect(mocks.callbacks.removeCallbackData).toHaveBeenCalledWith(SHORT_ID)
	})

	it('keeps the original info and appends the error state on failure (R5.2)', async () => {
		inspectReturns('nginx:1.0.0')
		mocks.core.runContainerUpdateTask.mockImplementation(async () => ({
			taskId: 'task-1',
			done: Promise.resolve({ success: false, error: 'pull failed' })
		}))

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const texts = editTexts()
		const lastText = texts[texts.length - 1]
		expect(lastText).toContain('web')
		expect(lastText).toContain('❌')
		expect(lastText).toContain('Update failed')
		expect(mocks.callbacks.removeCallbackData).toHaveBeenCalledWith(SHORT_ID)
	})

	it('shows "already up to date" without pulling and purges the callback (R8.1)', async () => {
		inspectReturns('nginx:1.2.3')

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const texts = editTexts()
		const lastText = texts[texts.length - 1]
		expect(lastText).toContain('web')
		expect(lastText).toContain('ℹ️')
		expect(lastText).toContain('Already up to date')
		expect(mocks.core.runContainerUpdateTask).not.toHaveBeenCalled()
		expect(mocks.callbacks.removeCallbackData).toHaveBeenCalledWith(SHORT_ID)
	})

	it('ignores callbacks from chats outside TELEGRAM_CHAT_ID (R13.2)', async () => {
		await handleCallbackQuery(
			bot as unknown as CallbackBot,
			makeQuery({
				message: {
					message_id: MESSAGE_ID,
					date: 0,
					chat: { id: 999999999, type: 'private' }
				}
			})
		)

		expect(bot.editMessageText).not.toHaveBeenCalled()
		expect(bot.answerCallbackQuery).not.toHaveBeenCalled()
		expect(mocks.callbacks.getCallbackData).not.toHaveBeenCalled()
		expect(mocks.docker.getContainer).not.toHaveBeenCalled()
	})

	it('falls back to the tap metadata when the callback has no stored coords', async () => {
		mocks.callbacks.getCallbackData.mockResolvedValue({
			...baseCallback(),
			chatId: undefined,
			messageId: undefined
		})
		inspectReturns('nginx:1.0.0')

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const calls = bot.editMessageText.mock.calls as [
			string,
			{ chat_id: number; message_id: number }
		][]
		expect(calls.length).toBeGreaterThan(0)
		for (const [, options] of calls) {
			expect(options.chat_id).toBe(CHAT_ID)
			expect(options.message_id).toBe(MESSAGE_ID)
		}
	})

	it('answers stale callbacks without editing (R3.2, R11.1)', async () => {
		mocks.callbacks.getCallbackData.mockResolvedValue(null)

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		expect(bot.answerCallbackQuery).toHaveBeenCalledTimes(1)
		expect(bot.editMessageText).not.toHaveBeenCalled()
		expect(mocks.docker.getContainer).not.toHaveBeenCalled()
	})

	it('ignores non-u: callback data without touching the store', async () => {
		await handleCallbackQuery(
			bot as unknown as CallbackBot,
			makeQuery({ data: 'shuffle' })
		)

		expect(bot.answerCallbackQuery).toHaveBeenCalledTimes(1)
		expect(mocks.callbacks.getCallbackData).not.toHaveBeenCalled()
		expect(bot.editMessageText).not.toHaveBeenCalled()
	})

	it('keeps the updating status (with info) when the core rethrows the dedup race (R7.1)', async () => {
		inspectReturns('nginx:1.0.0')
		mocks.core.runContainerUpdateTask.mockRejectedValue(
			new Error('Container update already in progress')
		)

		await handleCallbackQuery(bot as unknown as CallbackBot, makeQuery())

		const texts = editTexts()
		const lastText = texts[texts.length - 1]
		expect(lastText).toContain('web')
		expect(lastText).toContain('🔄')
		expect(lastText).toContain('Updating...')
		expect(mocks.callbacks.removeCallbackData).not.toHaveBeenCalled()
	})
})
