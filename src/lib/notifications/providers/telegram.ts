import type { SendMessageParams } from 'node-telegram-bot-api'
import TelegramBot from 'node-telegram-bot-api'
import type {
	NotificationMessage,
	NotificationTranslations
} from '@/types/app-state'
import {
	storeCallbackData,
	updateCallbackMessageData
} from '../notification-callbacks'
import { BaseNotificationProvider } from './base'

/**
 * Formats the Markdown info block for an update notification. Shared by the
 * outbound provider (send) and the inbound poller, which resurrects the
 * original info across edits and rebuilds it with the post-update version on
 * success.
 */
export function formatTelegramMessage(message: NotificationMessage): string {
	// Get translations from message (will be added by notification service)
	const t = message.translations as NotificationTranslations

	const lines = [
		`🐳 *${t.title}*`,
		'',
		`*${t.container}:* \`${message.containerName}\``,
		`*${t.image}:* \`${message.imageName}\``,
		`*${t.current}:* \`${message.currentVersion}\``,
		`*${t.latest}:* \`${message.latestVersion}\``
	]

	if (message.lastUpdated) {
		const instant = Temporal.Instant.from(message.lastUpdated)
		lines.push(
			`*${t.updated}:* ${instant.toLocaleString(message.locale, {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			})}`
		)
	}

	if (message.dockerHubUrl) {
		lines.push('', `📂 [${t.viewOnRegistry}](${message.dockerHubUrl})`)
	}
	if (message.referenceUrl) {
		lines.push('', `🔗 [${t.viewReference}](${message.referenceUrl})`)
	}

	return lines.join('\n')
}

export class TelegramNotificationProvider extends BaseNotificationProvider {
	name = 'telegram'
	enabled: boolean
	private botToken?: string
	private chatId?: string
	private bot?: TelegramBot

	constructor() {
		super()
		this.botToken = process.env.TELEGRAM_BOT_TOKEN
		this.chatId = process.env.TELEGRAM_CHAT_ID
		this.enabled = process.env.TELEGRAM_ENABLED === 'true'

		if (this.enabled && this.validate() && this.botToken) {
			// Outbound-only: the inbound poller lives in telegram-polling.ts
			// (single getUpdates loop per token — R4/N1).
			this.bot = new TelegramBot(this.botToken, { polling: false })
		}
	}

	validate(): boolean {
		if (!this.enabled) return false

		if (!this.botToken || !this.chatId) {
			console.error(
				'Telegram provider enabled but missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'
			)
			return false
		}

		return true
	}

	async send(message: NotificationMessage): Promise<void> {
		if (!this.validate() || !this.bot) {
			throw new Error('Telegram provider not properly configured')
		}

		try {
			const text = formatTelegramMessage(message)
			if (!this.chatId) {
				throw new Error('Chat ID not configured')
			}

			const options: Omit<SendMessageParams, 'chat_id' | 'text'> = {
				parse_mode: 'Markdown',
				link_preview_options: { is_disabled: true }
			}

			// R2: inline "Update" button backed by the callback store. The
			// 8-char shortId keeps callback_data ≤ 64 bytes (N5). If the store
			// write fails, still send the notification without the button. The
			// base message info is persisted alongside so the poller can keep
			// it visible while it edits the message through the update phases.
			let shortId: string | undefined
			if (message.dockerContainerId && message.fullImageName) {
				try {
					shortId = await storeCallbackData(
						message.dockerContainerId,
						message.fullImageName,
						message.locale || 'en',
						{
							containerName: message.containerName,
							imageName: message.imageName,
							currentVersion: message.currentVersion,
							latestVersion: message.latestVersion,
							dockerHubUrl: message.dockerHubUrl,
							referenceUrl: message.referenceUrl,
							lastUpdated: message.lastUpdated
						}
					)
					options.reply_markup = {
						inline_keyboard: [
							[
								{
									text: message.translations?.update || 'Update',
									callback_data: `u:${shortId}`
								}
							]
						]
					}
				} catch (error) {
					console.error('❌ Failed to store Telegram callback:', error)
				}
			}

			const sent = await this.bot.sendMessage(this.chatId, text, options)
			console.log(`📨 Telegram notification sent for ${message.containerName}`)

			// The poller edits the EXACT message that carried the button; keep
			// its coordinates next to the callback data.
			if (shortId) {
				try {
					await updateCallbackMessageData(shortId, {
						chatId: sent.chat.id,
						messageId: sent.message_id
					})
				} catch (error) {
					console.error(
						'❌ Failed to store Telegram message coordinates:',
						error
					)
				}
			}
		} catch (error) {
			console.error('❌ Failed to send Telegram notification:', error)
			throw error
		}
	}
}
