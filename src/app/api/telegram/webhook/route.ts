import { type NextRequest, NextResponse } from 'next/server'
import TelegramBot from 'node-telegram-bot-api'
import { updateContainerImage } from '@/actions/docker'
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries'
import {
	getCallbackData,
	removeCallbackData
} from '@/lib/notifications/notification-callbacks'
import {
	clearUpdateProgress,
	isUpdateInProgress,
	markUpdateInProgress
} from '@/lib/notifications/webhook-debounce'

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

interface CallbackQuery {
	id: string
	from?: TelegramBot.User
	message?: TelegramBot.Message
	data?: string
}

interface TelegramUpdate {
	update_id: number
	callback_query?: CallbackQuery
}

/**
 * Parse callback_data format: u:{shortId}
 * Telegram limits callback_data to 64 bytes, so we store full data in a JSON file
 * and only pass a short reference ID
 */
function parseCallbackData(callbackData: string): {
	containerId: string
	fullImageName: string
	locale: Locale
	shortId: string
} | null {
	const parts = callbackData.split(':')
	if (parts.length !== 2 || parts[0] !== 'u') {
		return null
	}

	const shortId = parts[1]
	const storedData = getCallbackData(shortId)

	if (!storedData) {
		console.warn(
			'[Telegram Webhook] Callback data not found or expired:',
			shortId
		)
		return null
	}

	return {
		containerId: storedData.containerId,
		fullImageName: storedData.fullImageName,
		locale: (storedData.locale as Locale) || 'en',
		shortId
	}
}

/**
 * Validate the webhook secret from query params
 */
function validateSecret(request: NextRequest): boolean {
	const providedSecret = request.nextUrl.searchParams.get('secret')
	if (!TELEGRAM_WEBHOOK_SECRET) {
		console.error('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET not configured')
		return false
	}
	if (!providedSecret || providedSecret !== TELEGRAM_WEBHOOK_SECRET) {
		console.warn('[Telegram Webhook] Invalid or missing secret')
		return false
	}
	return true
}

/**
 * Change message to show "Updating..." state immediately
 * The original button is removed and replaced with inline text showing the update is in progress
 */
async function setMessageToUpdating(
	bot: TelegramBot,
	chatId: number,
	messageId: number,
	originalText: string,
	updatingText: string
): Promise<void> {
	// Add "Updating..." status to the message, remove the original button
	await bot.editMessageText(`${originalText}\n\n${updatingText}`, {
		chat_id: chatId,
		message_id: messageId,
		parse_mode: 'Markdown'
	})
}

/**
 * Update message with final status (success or error) and remove the button
 */
async function updateMessageWithStatus(
	bot: TelegramBot,
	chatId: number,
	messageId: number,
	originalText: string,
	statusText: string
): Promise<void> {
	// Append status to the original message and remove buttons
	await bot.editMessageText(`${originalText}\n\n${statusText}`, {
		chat_id: chatId,
		message_id: messageId,
		parse_mode: 'Markdown'
	})
}

/**
 * Answer the callback query to dismiss Telegram's loading state
 */
async function answerCallback(
	bot: TelegramBot,
	callbackQueryId: string
): Promise<void> {
	try {
		await bot.answerCallbackQuery(callbackQueryId)
	} catch (error) {
		console.error('[Telegram Webhook] Failed to answer callback:', error)
	}
}

export async function POST(request: NextRequest) {
	// Validate secret
	if (!validateSecret(request)) {
		return NextResponse.json(
			{ error: 'Invalid or missing webhook secret' },
			{ status: 401 }
		)
	}

	// Check bot token is configured
	if (!TELEGRAM_BOT_TOKEN) {
		console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not configured')
		return NextResponse.json(
			{ error: 'Bot token not configured' },
			{ status: 500 }
		)
	}

	let body: TelegramUpdate
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
	}

	const callbackQuery = body.callback_query
	if (!callbackQuery) {
		return NextResponse.json(
			{ error: 'No callback_query found' },
			{ status: 400 }
		)
	}

	const callbackData = callbackQuery.data
	if (!callbackData) {
		return NextResponse.json(
			{ error: 'No callback_data found' },
			{ status: 400 }
		)
	}

	// Get message info for editing
	const message = callbackQuery.message
	if (!message?.chat || !message.message_id) {
		return NextResponse.json(
			{ error: 'Message information not found' },
			{ status: 400 }
		)
	}

	const chatId = message.chat.id
	const messageId = message.message_id
	const originalText = message.text || ''

	// Parse callback_data
	const parsed = parseCallbackData(callbackData)
	if (!parsed) {
		console.warn(
			'[Telegram Webhook] Invalid callback_data format:',
			callbackData
		)
		return NextResponse.json(
			{ error: 'Invalid callback_data format' },
			{ status: 400 }
		)
	}

	const { containerId, fullImageName, locale, shortId } = parsed
	console.log(
		`[Telegram Webhook] Update request for container ${containerId} to ${fullImageName}`
	)

	// Get dictionary for translations
	const dict = getDictionary(locale)

	// Check debounce
	if (isUpdateInProgress(containerId)) {
		const _message =
			dict.webhook?.updateInProgress ||
			'Update already in progress. Please wait.'
		const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false })
		await answerCallback(bot, callbackQuery.id)
		return NextResponse.json({ status: 'debounced' })
	}

	// Mark update in progress
	markUpdateInProgress(containerId)

	// Create bot instance
	const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false })

	// Step 1: Immediately change message to "Updating..." state
	const updatingText = dict.notifications?.updating || '🔄 Updating...'
	await setMessageToUpdating(bot, chatId, messageId, originalText, updatingText)

	try {
		// Step 2: Execute the container update
		const result = await updateContainerImage(containerId, fullImageName)

		if (result.success) {
			// Clear the lock and callback data after successful update
			clearUpdateProgress(containerId)
			removeCallbackData(shortId)

			// Determine status message
			let statusMessage: string
			if (result.alreadyUpToDate) {
				// Image was already up to date
				statusMessage =
					dict.webhook?.updateAlreadyUpToDate || 'ℹ️ Image is already up to date'
			} else {
				statusMessage =
					dict.notifications?.updateStatusSuccess ||
					'Status: ✅ Updated successfully'
			}

			// Update message with success status and remove buttons
			await updateMessageWithStatus(
				bot,
				chatId,
				messageId,
				originalText,
				statusMessage
			)

			console.log(`[Telegram Webhook] Update successful for ${containerId}`)
		} else {
			// Clear the lock on failure
			clearUpdateProgress(containerId)

			// Update message with error status and remove buttons
			const statusMessage =
				dict.notifications?.updateStatusError || 'Status: ❌ Update failed'

			await updateMessageWithStatus(
				bot,
				chatId,
				messageId,
				originalText,
				statusMessage
			)

			console.error(
				`[Telegram Webhook] Update failed for ${containerId}:`,
				result.error
			)
		}

		// Step 3: Answer callback to dismiss loading state
		await answerCallback(bot, callbackQuery.id)

		return NextResponse.json({
			status: result.success ? 'success' : 'error',
			containerId,
			newContainerId: result.newContainerId
		})
	} catch (error) {
		// Clear the debounce lock on error
		clearUpdateProgress(containerId)

		// Update message with error status and remove buttons
		const statusMessage =
			dict.notifications?.updateStatusError || 'Status: ❌ Update failed'

		await updateMessageWithStatus(
			bot,
			chatId,
			messageId,
			originalText,
			statusMessage
		)

		// Answer callback to dismiss loading state
		await answerCallback(bot, callbackQuery.id)

		console.error('[Telegram Webhook] Exception during update:', error)
		return NextResponse.json(
			{ error: 'Update failed', status: 'error' },
			{ status: 500 }
		)
	}
}

// Only accept POST requests
export async function GET() {
	return NextResponse.json(
		{ error: 'Method not allowed. Use POST for webhook.' },
		{ status: 405 }
	)
}
