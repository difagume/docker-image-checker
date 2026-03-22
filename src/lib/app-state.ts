import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
	ContainerUpdate,
	FilterStatus,
	NotificationState,
	NotifiedUpdate
} from '@/types/app-state'

const STATE_FILE_PATH = path.join(process.cwd(), 'data', 'dashboard-state.json')

/**
 * Generate a unique ID for a container update
 * Format: containerName:imageName:latestDigest
 */
export function generateContainerId(update: ContainerUpdate): string {
	return `${update.containerName}:${update.imageName}:${update.latestDigest}`
}

/**
 * Load notification state from JSON file
 */
export async function loadState(): Promise<NotificationState> {
	try {
		// Ensure data directory exists
		const dataDir = path.dirname(STATE_FILE_PATH)
		await fs.mkdir(dataDir, { recursive: true })

		// Try to read existing state
		const data = await fs.readFile(STATE_FILE_PATH, 'utf-8')
		if (!data || data.trim() === '') {
			return { notifiedUpdates: {} }
		}
		return JSON.parse(data) as NotificationState
	} catch (error) {
		// If file doesn't exist or is invalid, return empty state
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('No existing app state found, creating new state')
		} else {
			console.error('Error loading app state:', error)
		}
		return { notifiedUpdates: {} }
	}
}

/**
 * Save notification state to JSON file
 */
export async function saveState(state: NotificationState): Promise<void> {
	try {
		// Ensure data directory exists
		const dataDir = path.dirname(STATE_FILE_PATH)
		await fs.mkdir(dataDir, { recursive: true })

		// Write state to file
		await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8')
		console.log('App state saved successfully')
	} catch (error) {
		const err = error as NodeJS.ErrnoException
		if (err.code === 'EACCES') {
			console.error(
				`Error saving app state: Permission denied at ${STATE_FILE_PATH}.`
			)
			console.error(
				'Tip: If using Docker bind mounts, ensure the host directory has the correct permissions (e.g., sudo chown -R 1001:1001 ./notifications-data)'
			)
		} else {
			console.error('Error saving app state:', error)
		}
		throw error
	}
}

/**
 * Check if an update has already been notified
 */
export function hasBeenNotified(
	state: NotificationState,
	update: ContainerUpdate
): boolean {
	const containerId = generateContainerId(update)
	return containerId in state.notifiedUpdates
}

/**
 * Mark an update as notified
 */
export async function markAsNotified(update: ContainerUpdate): Promise<void> {
	const state = await loadState()
	const containerId = generateContainerId(update)

	const notifiedUpdate: NotifiedUpdate = {
		notifiedAt: new Date().toISOString(),
		containerName: update.containerName,
		imageName: update.imageName,
		latestVersion: update.latestVersion,
		latestDigest: update.latestDigest
	}

	state.notifiedUpdates[containerId] = notifiedUpdate
	state.lastCheck = new Date().toISOString()

	await saveState(state)
}

/**
 * Get all notified updates
 */
export async function getNotifiedUpdates(): Promise<
	Record<string, NotifiedUpdate>
> {
	const state = await loadState()
	return state.notifiedUpdates
}

/**
 * Get last check timestamp
 */
export async function getLastCheck(): Promise<string | undefined> {
	const state = await loadState()
	return state.lastCheck
}

/**
 * Clear old notifications (older than specified days)
 */
export async function clearOldNotifications(daysOld = 30): Promise<void> {
	const state = await loadState()
	const cutoffDate = new Date()
	cutoffDate.setDate(cutoffDate.getDate() - daysOld)

	const filteredUpdates: Record<string, NotifiedUpdate> = {}

	for (const [key, value] of Object.entries(state.notifiedUpdates)) {
		const notifiedDate = new Date(value.notifiedAt)
		if (notifiedDate > cutoffDate) {
			filteredUpdates[key] = value
		}
	}

	state.notifiedUpdates = filteredUpdates
	await saveState(state)

	console.log(`Cleared notifications older than ${daysOld} days`)
}

/**
 * Get hidden container IDs
 */
export async function getHiddenContainerIds(): Promise<string[]> {
	const state = await loadState()
	return state.hiddenContainerIds || []
}

/**
 * Set hidden container IDs
 */
export async function setHiddenContainerIds(ids: string[]): Promise<void> {
	const state = await loadState()
	state.hiddenContainerIds = ids
	await saveState(state)
}

export async function isContainerHidden(containerId: string): Promise<boolean> {
	const hiddenIds = await getHiddenContainerIds()
	return hiddenIds.includes(containerId)
}

/**
 * Get ignored notification container IDs
 */
export async function getIgnoredNotificationContainerIds(): Promise<string[]> {
	const state = await loadState()
	return state.ignoredNotificationIds || []
}

/**
 * Set ignored notification container IDs
 */
export async function setIgnoredNotificationContainerIds(
	ids: string[]
): Promise<void> {
	const state = await loadState()
	state.ignoredNotificationIds = ids
	await saveState(state)
}

/**
 * Check if a container has notifications ignored
 */
export async function isContainerIgnored(
	containerId: string
): Promise<boolean> {
	const ignoredIds = await getIgnoredNotificationContainerIds()
	return ignoredIds.includes(containerId)
}

/**
 * Get preferred language for notifications
 */
export async function getPreferredLanguage(): Promise<string> {
	const state = await loadState()
	return state.preferredLanguage || process.env.NOTIFICATIONS_LANGUAGE || 'en'
}

/**
 * Set preferred language for notifications
 */
export async function setPreferredLanguage(language: string): Promise<void> {
	const state = await loadState()
	state.preferredLanguage = language
	await saveState(state)
}

/**
 * Get dashboard settings (filters, show hidden)
 */
export async function getDashboardSettings(): Promise<{
	activeFilters: FilterStatus[]
	showHiddenMode: boolean
}> {
	const state = await loadState()
	return {
		activeFilters: (state.activeFilters as FilterStatus[]) || [
			'updated',
			'available',
			'unknown'
		],
		showHiddenMode: state.showHiddenMode || false
	}
}

/**
 * Set dashboard settings
 */
export async function setDashboardSettings(settings: {
	activeFilters?: FilterStatus[]
	showHiddenMode?: boolean
}): Promise<void> {
	const state = await loadState()
	if (settings.activeFilters !== undefined) {
		state.activeFilters = settings.activeFilters
	}
	if (settings.showHiddenMode !== undefined) {
		state.showHiddenMode = settings.showHiddenMode
	}
	await saveState(state)
}
