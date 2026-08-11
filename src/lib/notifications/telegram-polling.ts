import type { ContainerInspectInfo } from 'dockerode'
import type { CallbackQuery, InlineKeyboardMarkup } from 'node-telegram-bot-api'
import TelegramBot from 'node-telegram-bot-api'
import { runContainerUpdateTask } from '@/lib/container-update-task'
import docker from '@/lib/docker'
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries'
import type { UpdatePhase } from '@/lib/update-progress-store'
import { progressStore } from '@/lib/update-progress-store'
import type { NotificationMessage } from '@/types/app-state'
import type { CallbackData } from './notification-callbacks'
import { getCallbackData, removeCallbackData } from './notification-callbacks'
import { formatTelegramMessage } from './providers/telegram'
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

// The poller only needs these two outbound operations; typing against a narrow
// Pick keeps the module testable with a structural mock bot.
export type CallbackBot = Pick<
	TelegramBot,
	'editMessageText' | 'answerCallbackQuery'
>

// Snapshot of allowed chats, parsed once at init. Callback queries from any
// other chat are ignored (R13).
let allowedChatIds = new Set<string>()

/**
 * Replace the allowed-chat set. Used by `initTelegramPolling` from env and
 * by unit tests that drive `handleCallbackQuery` directly with a mock bot.
 */
export function setAllowedChatIds(ids: Iterable<string>): void {
	allowedChatIds = new Set(ids)
}

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
	bot: CallbackBot,
	chatId: number,
	messageId: number,
	text: string,
	options?: { reply_markup?: InlineKeyboardMarkup }
): Promise<void> {
	try {
		await bot.editMessageText(text, {
			chat_id: chatId,
			message_id: messageId,
			parse_mode: 'Markdown',
			link_preview_options: { is_disabled: true },
			...(options?.reply_markup ? { reply_markup: options.reply_markup } : {})
		})
	} catch (error) {
		// Benign edit errors (racy taps / identical text) must not surface (D7)
		if (isBenignEditError(error)) return
		console.error('[telegram-polling] message edit failed:', error)
	}
}

async function safeAnswer(
	bot: CallbackBot,
	callbackQueryId: string,
	text?: string
): Promise<void> {
	try {
		await bot.answerCallbackQuery(callbackQueryId, text ? { text } : {})
	} catch (error) {
		console.error('[telegram-polling] answerCallbackQuery failed:', error)
	}
}

/**
 * Build the base info block of the notification from the persisted callback
 * data. It is computed ONCE per tap and reused verbatim for every edit: the
 * original container/image/version block never changes, only the status below
 * it evolves (decision — "info muestra el estado de origen; estado confirma el
 * resultado"; the post-update version is intentionally NOT injected).
 */
function buildInfoMessage(callback: CallbackData, locale: Locale): string {
	const t = getDictionary(locale).notifications
	const message: NotificationMessage = {
		containerName: callback.containerName || 'Unnamed',
		imageName: callback.imageName || callback.fullImageName,
		dockerContainerId: callback.containerId,
		fullImageName: callback.fullImageName,
		currentVersion: callback.currentVersion ?? 'N/A',
		latestVersion: callback.latestVersion ?? 'N/A',
		dockerHubUrl: callback.dockerHubUrl,
		referenceUrl: callback.referenceUrl,
		lastUpdated: callback.lastUpdated,
		translations: {
			title: t.title,
			container: t.container,
			image: t.image,
			current: t.current,
			latest: t.latest,
			updated: t.updated,
			viewReference: t.viewReference,
			viewOnRegistry: t.viewOnRegistry,
			update: t.update,
			updating: t.updating,
			updateStatusSuccess: t.updateStatusSuccess,
			updateStatusError: t.updateStatusError,
			updateStatusAlready: t.updateStatusAlready
		},
		locale
	}
	return formatTelegramMessage(message)
}

/**
 * Info block stays permanently visible; the volatile status (progress / final
 * state) is appended below it. A blank line keeps the Markdown readable.
 */
function composeEditText(baseInfo: string, statusBlock: string): string {
	return `${baseInfo}\n\n${statusBlock}`
}

/**
 * Localized phase label (R14.1 — the phase texts are hardcoded English inside
 * the shared core, so the poller maps them to the i18n dict instead of echoing
 * `statusText`). Pulling appends the numeric layer progress.
 */
function statusBlockForPhase(
	locale: Locale,
	phase: UpdatePhase,
	data?: {
		statusText?: string
		layerProgress?: { currentLayer?: number; totalLayers?: number }
	}
): string {
	const updatingDict = getDictionary(locale).container.updating
	const label =
		phase in updatingDict
			? updatingDict[phase as keyof typeof updatingDict]
			: phase
	if (
		phase === 'pulling' &&
		typeof data?.layerProgress?.totalLayers === 'number'
	) {
		return `${label} ${data.layerProgress.currentLayer ?? 0}/${data.layerProgress.totalLayers}`
	}
	return label
}

/**
 * Terminal states drop the inline "Update" button so a finished message does
 * not keep a dead button (taps on it resolve to "stale callback" because the
 * callback entry is removed on completion).
 */
const EMPTY_KEYBOARD: { reply_markup: InlineKeyboardMarkup } = {
	reply_markup: { inline_keyboard: [] }
}

export async function handleCallbackQuery(
	bot: CallbackBot,
	query: CallbackQuery
): Promise<void> {
	const data = query.data
	const queryChatId = query.message?.chat.id
	const queryMessageId = query.message?.message_id

	if (typeof data !== 'string' || !data.startsWith('u:')) {
		await safeAnswer(bot, query.id)
		return
	}

	// R13: only accept chats present in the parsed TELEGRAM_CHAT_ID set. The
	// button's message must exist to be edited; the tap metadata is also the
	// fallback for the edit coordinates when the provider-side coords are
	// missing (legacy entries).
	if (
		queryChatId === undefined ||
		queryMessageId === undefined ||
		!allowedChatIds.has(String(queryChatId))
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

	const locale = (callback.locale || 'en') as Locale
	const t = getDictionary(locale).notifications

	// Prefer the message coordinates persisted by the provider at send time —
	// they reference the exact message that carried the button — and fall back
	// to the tap metadata (R5).
	const chatId = callback.chatId ?? queryChatId
	const messageId = callback.messageId ?? queryMessageId
	if (chatId === undefined || messageId === undefined) {
		return
	}

	const baseInfo = buildInfoMessage(callback, locale)

	// R5: keep the original container info visible; append the "updating…"
	// status below it. The inline button stays through progress edits.
	await safeEditMessage(
		bot,
		chatId,
		messageId,
		composeEditText(baseInfo, `🔄 ${t.updating}`)
	)

	// R7: dedup — a non-terminal task for this container is already running
	if (progressStore.isContainerUpdating(callback.containerId)) {
		return
	}

	// R9: container removed
	let containerInfo: ContainerInspectInfo
	try {
		containerInfo = await docker.getContainer(callback.containerId).inspect()
	} catch {
		await safeEditMessage(
			bot,
			chatId,
			messageId,
			composeEditText(baseInfo, `❌ ${t.updateStatusError}`),
			EMPTY_KEYBOARD
		)
		await removeCallbackData(shortId)
		return
	}

	// R8: already up to date — no pull
	if (containerInfo.Config.Image === callback.fullImageName) {
		await safeEditMessage(
			bot,
			chatId,
			messageId,
			composeEditText(baseInfo, `ℹ️ ${t.updateStatusAlready}`),
			EMPTY_KEYBOARD
		)
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
						composeEditText(baseInfo, statusBlockForPhase(locale, phase, data))
					)
				}
			}
		)

		const result = await handle.done
		if (result.success) {
			// Success: keep the ORIGINAL info block untouched (it reflects the
			// pre-update origin) and only swap the status below to "✅
			// actualizado". Reading info + status tells the reader which version
			// was installed and that it was applied.
			await safeEditMessage(
				bot,
				chatId,
				messageId,
				composeEditText(baseInfo, `✅ ${t.updateStatusSuccess}`),
				EMPTY_KEYBOARD
			)
		} else {
			await safeEditMessage(
				bot,
				chatId,
				messageId,
				composeEditText(baseInfo, `❌ ${t.updateStatusError}`),
				EMPTY_KEYBOARD
			)
		}
		await removeCallbackData(shortId)
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === 'Container update already in progress'
		) {
			// Race: a concurrent update started between our check and the core.
			// Keep the button valid — the other task is handling this container.
			await safeEditMessage(
				bot,
				chatId,
				messageId,
				composeEditText(baseInfo, `🔄 ${t.updating}`)
			)
			return
		}
		console.error('[telegram-polling] update task failed:', error)
		await safeEditMessage(
			bot,
			chatId,
			messageId,
			composeEditText(baseInfo, `❌ ${t.updateStatusError}`),
			EMPTY_KEYBOARD
		)
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

	setAllowedChatIds(parseAllowedChatIds(process.env.TELEGRAM_CHAT_ID))
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
