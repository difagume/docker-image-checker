import type { NotificationMessage } from '@/types/notifications'
import { BaseNotificationProvider } from './base'

interface NtfyAction {
	action: string
	label: string
	url: string
	clear?: boolean
}

interface NtfyPayload {
	topic: string
	message: string
	title?: string
	tags?: string[]
	priority?: number
	actions?: NtfyAction[]
}

export class NtfyNotificationProvider extends BaseNotificationProvider {
	name = 'ntfy'
	enabled: boolean
	private topic?: string
	private server: string
	private username?: string
	private password?: string
	private token?: string

	constructor() {
		super()
		this.enabled = process.env.NTFY_ENABLED === 'true'
		this.topic = process.env.NTFY_TOPIC
		this.server = process.env.NTFY_SERVER || 'https://ntfy.sh'
		this.username = process.env.NTFY_USERNAME
		this.password = process.env.NTFY_PASSWORD
		this.token = process.env.NTFY_TOKEN
	}

	validate(): boolean {
		if (!this.enabled) return false

		if (!this.topic) {
			console.error('ntfy provider enabled but missing NTFY_TOPIC')
			return false
		}

		return true
	}

	async send(message: NotificationMessage): Promise<void> {
		if (!this.validate()) {
			throw new Error('ntfy provider not properly configured')
		}

		try {
			// Get translations from message
			const t = message.translations || {
				title: 'Docker Image Update',
				container: 'Container',
				image: 'Image',
				current: 'Current',
				latest: 'Latest',
				updated: 'Updated'
			}

			const title = `🐳 ${t.title}`
			const bodyLines = [
				`${t.container}: ${message.containerName}`,
				`${t.image}: ${message.imageName}`,
				`${t.current}: ${message.currentVersion}`,
				`${t.latest}: ${message.latestVersion}`
			]

			if (message.lastUpdated) {
				const date = new Date(message.lastUpdated)
				bodyLines.push(
					`${t.updated}: ${date.toLocaleString(message.locale, {
						year: 'numeric',
						month: '2-digit',
						day: '2-digit',
						hour: '2-digit',
						minute: '2-digit'
					})}`
				)
			}

			const payload: NtfyPayload = {
				topic: this.topic || '',
				title: title,
				message: bodyLines.join('\n'),
				tags: ['whale', 'package'],
				priority: 3
			}

			// Add actions if Docker Hub URL is available
			if (message.dockerHubUrl) {
				payload.actions = [
					{
						action: 'view',
						label: 'Open Registry',
						url: message.dockerHubUrl,
						clear: true
					}
				]
			}

			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			}

			// Add authentication header
			if (this.token) {
				headers.Authorization = `Bearer ${this.token}`
			} else if (this.username && this.password) {
				const auth = Buffer.from(`${this.username}:${this.password}`).toString(
					'base64'
				)
				headers.Authorization = `Basic ${auth}`
			}

			const response = await fetch(`${this.server}`, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload)
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`ntfy API error (${response.status}): ${errorText}`)
			}

			console.log(`📨 ntfy notification sent for ${message.containerName}`)
		} catch (error) {
			console.error('❌ Failed to send ntfy notification:', error)
			throw error
		}
	}
}
