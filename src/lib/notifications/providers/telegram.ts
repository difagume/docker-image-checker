import TelegramBot from 'node-telegram-bot-api'
import type {
	NotificationMessage,
	NotificationTranslations
} from '@/types/app-state'
import { BaseNotificationProvider } from './base'

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
			const text = this.formatTelegramMessage(message)
			if (!this.chatId) {
				throw new Error('Chat ID not configured')
			}
			await this.bot.sendMessage(this.chatId, text, {
				parse_mode: 'Markdown',
				link_preview_options: { is_disabled: true }
			})
			console.log(`📨 Telegram notification sent for ${message.containerName}`)
		} catch (error) {
			console.error('❌ Failed to send Telegram notification:', error)
			throw error
		}
	}

	private formatTelegramMessage(message: NotificationMessage): string {
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
}
