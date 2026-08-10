import type { ContainerInspectInfo } from 'dockerode'
import type { CallbackQuery } from 'node-telegram-bot-api'
import TelegramBot from 'node-telegram-bot-api'
import { runContainerUpdateTask } from '@/lib/container-update-task'
import docker from '@/lib/docker'
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries'
import type { UpdatePhase } from '@/lib/update-progress-store'
import { progressStore } from '@/lib/update-progress-store'
import { getCallbackData, removeCallbackData } from './notification-callbacks'
import { requestRevalidation } from './revalidate-tunnel'

/**
 * Long-polling inbound bot that turns inline "Update" button taps into the same
 * update pipeline as the web dashboard. Started from `instrumentation.ts`
 * `register()` next to the scheduler, gated by env (R4.2) and a `globalThis`
 * singleton so dev HMR never spawns a second `getUpdates` loop (R4.1 — Telegram
 * answers a duplicate poller with HTTP 409). The outbound provider stays
 * `polling: false`; this module is the ONLY poller for the token.
 */

const POLLER_GLOBAL_KEY = '__docker_telegram_poller__'

interface PollerHandle {
	bot: TelegramBot
	running: boolean
}

// Snapshot of allowed chats, parsed once at init. Callback queries from any
// other chat are ignored (R13).
let allowedChatIds = new Set<string>()

const PHASE_EDIT_INTERVAL_MS = 3000

/**
 * Parses the comma-separated `TELEGRAM_CHAT_ID` env value into a trimmed set
 * of allowed chat identifiers (numeric private/group ids or `@username`).
 */
export function parseAllowedChatIds(envValue?: string): Set<string> {
	const set = new Set<string>()
	if (!envValue) return set
	for (const part of envValue.split(',')) {
		const trimmed = part.trim()
		if (trimmed) set.add(trimmed)
	}
	return set
}

function getPollerHandle(): PollerHandle | undefined {
	const g = globalThis as unknown as Record<string, PollerHandle | undefined>
	return g[POLLER_GLOBAL_KEY]
}

function isBenignEditError(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: (error as { response?: { body?: { description?: string } } }).response
					?.body?.description
	return typeof message === 'string' && /message is not modified/i.test(message)
}

async function safeEditMessage(
	bot: TelegramBot,
	chatId: number,
	messageId: number,
	text: string
): Promise<void> {
	try {
		await bot.editMessageText(text, { chat_id: chatId, message_id: messageId })
	} catch (error) {
		// Benign edit errors (racy taps / identical text) must not surface (D7)
		if (isBenignEditError(error)) return
		console.error('[telegram-polling] message edit failed:', error)
	}
}

async function safeAnswer(
	bot: TelegramBot,
	callbackQueryId: string,
	text?: string
): Promise<void> {
	try {
		await bot.answerCallbackQuery(callbackQueryId, text ? { text } : {})
	} catch (error) {
		console.error('[telegram-polling] answerCallbackQuery failed:', error)
	}
}

async function handleCallbackQuery(
	bot: TelegramBot,
	query: CallbackQuery
): Promise<void> {
	const data = query.data
	const chatId = query.message?.chat.id
	const messageId = query.message?.message_id

	if (typeof data !== 'string' || !data.startsWith('u:')) {
		await safeAnswer(bot, query.id)
		return
	}

	// R13: only accept chats present in the parsed TELEGRAM_CHAT_ID set, and
	// require a real message (id) to edit the button's message.
	if (
		chatId === undefined ||
		messageId === undefined ||
		!allowedChatIds.has(String(chatId))
	) {
		return
	}

	const shortId = data.slice(2)
	const callback = await getCallbackData(shortId)
	if (!callback) {
		// Stale/expired button (R3.2, R11.1): acknowledge without pulling
		await safeAnswer(bot, query.id)
		return
	}

	// Dismiss the button spinner
	await safeAnswer(bot, query.id)

	const t = getDictionary(callback.locale as Locale).notifications

	// R5: editing… then the terminal state
	await safeEditMessage(bot, chatId, messageId, `🔄 ${t.updating}`)

	// R7: dedup — a non-terminal task for this container is already running
	if (progressStore.isContainerUpdating(callback.containerId)) {
		return
	}

	// R9: container removed
	let containerInfo: ContainerInspectInfo
	try {
		containerInfo = await docker.getContainer(callback.containerId).inspect()
	} catch {
		await safeEditMessage(bot, chatId, messageId, `❌ ${t.updateStatusError}`)
		await removeCallbackData(shortId)
		return
	}

	// R8: already up to date — no pull
	if (containerInfo.Config.Image === callback.fullImageName) {
		await safeEditMessage(bot, chatId, messageId, `ℹ️ ${t.updateStatusAlready}`)
		await removeCallbackData(shortId)
		return
	}

	// Run the shared core (same pipeline as the dashboard, R6.1). Revalidation
	// goes through the loopback tunnel — never `updateTag` outside the request
	// context (R12, N3).
	let lastEdit = 0
	let lastEditPhase: UpdatePhase | null = null

	try {
		const handle = await runContainerUpdateTask(
			callback.containerId,
			callback.fullImageName,
			{
				revalidate: async (tags) => {
					await requestRevalidation(tags)
				},
				onPhase: (phase, data) => {
					const now = Date.now()
					const phaseChanged = phase !== lastEditPhase
					if (!phaseChanged && now - lastEdit < PHASE_EDIT_INTERVAL_MS) {
						return
					}
					lastEditPhase = phase
					lastEdit = now
					void safeEditMessage(
						bot,
						chatId,
						messageId,
						data?.statusText || phase
					)
				}
			}
		)

		const result = await handle.done
		if (result.success) {
			await safeEditMessage(
				bot,
				chatId,
				messageId,
				`✅ ${t.updateStatusSuccess}`
			)
		} else {
			await safeEditMessage(bot, chatId, messageId, `❌ ${t.updateStatusError}`)
		}
		await removeCallbackData(shortId)
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === 'Container update already in progress'
		) {
			// Race: a concurrent update started between our check and the core.
			// Keep the button valid — the other task is handling this container.
			await safeEditMessage(bot, chatId, messageId, `🔄 ${t.updating}`)
			return
		}
		console.error('[telegram-polling] update task failed:', error)
		await safeEditMessage(bot, chatId, messageId, `❌ ${t.updateStatusError}`)
		await removeCallbackData(shortId)
	}
}

/**
 * Start the long-polling inbound bot (env-gated + singleton). No-op unless
 * notifications are enabled AND a bot token + chat id are configured (R4.2).
 */
export function initTelegramPolling(): void {
	if (process.env.NEXT_RUNTIME !== 'nodejs') return

	const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'
	const token = process.env.TELEGRAM_BOT_TOKEN

	if (!enabled || !token) {
		console.log(
			'[telegram-polling] not started (NOTIFICATIONS_ENABLED or TELEGRAM_BOT_TOKEN missing)'
		)
		return
	}

	allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_CHAT_ID)
	if (allowedChatIds.size === 0) {
		console.log('[telegram-polling] not started (TELEGRAM_CHAT_ID missing)')
		return
	}

	if (getPollerHandle()) {
		console.log('[telegram-polling] already running')
		return
	}

	const bot = new TelegramBot(token, { polling: true })
	const g = globalThis as unknown as Record<string, PollerHandle | undefined>
	g[POLLER_GLOBAL_KEY] = { bot, running: true }

	bot.on('callback_query', (query) => {
		handleCallbackQuery(bot, query).catch((error) => {
			console.error('[telegram-polling] callback handler failed:', error)
		})
	})

	console.log('[telegram-polling] long polling started')
}

/**
 * Stop the poller gracefully (SIGTERM/SIGINT). Fire-and-forget: natural
 * process end is otherwise acceptable (R15).
 */
export function stopTelegramPolling(): void {
	const handle = getPollerHandle()
	if (!handle) return
	const g = globalThis as unknown as Record<string, PollerHandle | undefined>
	g[POLLER_GLOBAL_KEY] = undefined
	handle.running = false
	handle.bot.stopPolling().catch((error) => {
		console.error('[telegram-polling] stopPolling failed:', error)
	})
}

export function getTelegramPollingStatus(): {
	enabled: boolean
	running: boolean
} {
	const handle = getPollerHandle()
	const enabled =
		process.env.NOTIFICATIONS_ENABLED === 'true' &&
		!!process.env.TELEGRAM_BOT_TOKEN &&
		!!process.env.TELEGRAM_CHAT_ID
	return {
		enabled,
		running: handle?.running ?? false
	}
}
