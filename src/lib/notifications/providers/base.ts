import type {
	NotificationMessage,
	NotificationProvider
} from '@/types/notifications'

export abstract class BaseNotificationProvider implements NotificationProvider {
	abstract name: string
	abstract enabled: boolean

	abstract send(message: NotificationMessage): Promise<void>
	abstract validate(): boolean

	protected formatMessage(message: NotificationMessage): string {
		const lines = [
			`🐳 Docker Image Update Available`,
			``,
			`Container: ${message.containerName}`,
			`Image: ${message.imageName}`,
			`Current: ${message.currentVersion}`,
			`Latest: ${message.latestVersion}`
		]

		if (message.lastUpdated) {
			const date = new Date(message.lastUpdated)
			lines.push(`Updated: ${date.toLocaleString()}`)
		}

		if (message.dockerHubUrl) {
			lines.push(``, `🔗 ${message.dockerHubUrl}`)
		}

		return lines.join('\n')
	}
}
