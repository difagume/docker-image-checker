export type FilterStatus =
	| 'updated'
	| 'available'
	| 'unknown'
	| 'local'
	| 'transient'

export interface NotificationTranslations {
	title: string
	container: string
	image: string
	current: string
	latest: string
	updated: string
	viewReference: string
	viewOnRegistry: string
	update: string
	updating: string
	updateStatusSuccess: string
	updateStatusError: string
	updateStatusAlready: string
}

export interface NotificationMessage {
	containerName: string
	imageName: string
	dockerContainerId: string
	fullImageName: string
	currentVersion: string
	latestVersion: string
	dockerHubUrl?: string
	referenceUrl?: string
	lastUpdated?: string
	translations?: NotificationTranslations
	locale?: string
}

export interface ContainerUpdate {
	dockerContainerId: string
	fullImageName: string
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

export type SortBy = 'name' | 'status'
export type SortDir = 'asc' | 'desc'

export interface NotificationState {
	notifiedUpdates: Record<string, NotifiedUpdate>
	lastCheck?: string
	hiddenContainerIds?: string[] // Container IDs that should be hidden from the dashboard
	ignoredNotificationIds?: string[] // Container IDs that should be excluded from notifications
	preferredLanguage?: string // User's preferred language for notifications (en, es, pt)
	activeFilters?: string[] // Active filters for the dashboard
	showHiddenMode?: boolean // Whether to show hidden containers
	sortBy?: SortBy // Persisted sort field (name/status), defaults to 'name' if missing
	sortDir?: SortDir // Persisted sort direction (asc/desc), defaults to 'asc' if missing
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
