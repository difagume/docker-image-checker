import type { NotificationMessage } from '@/types/app-state'
import { BaseNotificationProvider } from './base'

interface DiscordEmbed {
	title: string
	color: number
	url?: string
	fields: Array<{
		name: string
		value: string
		inline: boolean
	}>
	timestamp: string
	footer: {
		text: string
	}
}

export class DiscordNotificationProvider extends BaseNotificationProvider {
	name = 'discord'
	enabled: boolean
	private webhookUrl?: string

	constructor() {
		super()
		this.enabled = process.env.DISCORD_ENABLED === 'true'
		this.webhookUrl = process.env.DISCORD_WEBHOOK_URL
	}

	validate(): boolean {
		if (!this.enabled) return true
		return !!this.webhookUrl
	}

	async send(message: NotificationMessage): Promise<void> {
		if (!this.validate() || !this.webhookUrl) {
			throw new Error('Discord provider not properly configured')
		}

		try {
			// Get translations from message
			const t = message.translations || {
				title: 'Docker Image Update Available',
				container: 'Container',
				image: 'Image',
				current: 'Current',
				latest: 'Latest',
				updated: 'Updated',
				viewReference: 'View reference'
			}

			const embed: DiscordEmbed = {
				title: `🐳 ${t.title}`,
				color: 0x0099ff, // Blue
				fields: [
					{
						name: t.container,
						value: message.containerName,
						inline: false
					},
					{
						name: t.image,
						value: `\`${message.imageName}\``,
						inline: false
					},
					{
						name: t.current,
						value: `\`${message.currentVersion}\``,
						inline: false
					},
					{
						name: t.latest,
						value: `\`${message.latestVersion}\``,
						inline: false
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: 'Docker Image Checker'
				}
			}

			if (message.dockerHubUrl) {
				embed.url = message.dockerHubUrl
			}

			if (message.lastUpdated) {
				embed.fields.push({
					name: t.updated,
					value: new Date(message.lastUpdated).toLocaleString(message.locale, {
						year: 'numeric',
						month: '2-digit',
						day: '2-digit',
						hour: '2-digit',
						minute: '2-digit'
					}),
					inline: false
				})
			}
			if (message.referenceUrl) {
				embed.fields.push({
					name: t.viewReference,
					value: `[${message.referenceUrl}](${message.referenceUrl})`,
					inline: false
				})
			}

			const response = await fetch(this.webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					embeds: [embed]
				})
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`Discord API error (${response.status}): ${errorText}`)
			}

			console.log(`📨 Discord notification sent for ${message.containerName}`)
		} catch (error) {
			console.error('❌ Failed to send Discord notification:', error)
			throw error
		}
	}
}
