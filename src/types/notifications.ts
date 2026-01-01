export interface NotificationTranslations {
	title: string
	container: string
	image: string
	current: string
	latest: string
	updated: string
}

export interface NotificationMessage {
	containerName: string
	imageName: string
	currentVersion: string
	latestVersion: string
	dockerHubUrl?: string
	lastUpdated?: string
	translations?: NotificationTranslations
	locale?: string
}

export interface ContainerUpdate {
	containerId: string
	containerName: string
	imageName: string
	imageDigest: string
	currentVersion: string
	latestVersion: string
	latestDigest: string
	dockerHubUrl?: string
	lastUpdated?: string
}

export interface NotifiedUpdate {
	notifiedAt: string
	containerName: string
	imageName: string
	latestVersion: string
	latestDigest: string
}

export interface NotificationState {
	notifiedUpdates: Record<string, NotifiedUpdate>
	lastCheck?: string
	hiddenContainerIds?: string[] // Container IDs that should be excluded from notifications
	preferredLanguage?: string // User's preferred language for notifications (en, es, pt)
}

export interface NotificationConfig {
	enabled: boolean
	cronSchedule: string
	providers: {
		telegram: {
			enabled: boolean
			botToken?: string
			chatId?: string
		}
		ntfy: {
			enabled: boolean
			topic?: string
			server?: string
			username?: string
			password?: string
			token?: string
		}
		discord: {
			enabled: boolean
			webhookUrl?: string
		}
	}
}

export interface NotificationProvider {
	name: string
	enabled: boolean
	send(message: NotificationMessage): Promise<void>
	validate(): boolean
}
