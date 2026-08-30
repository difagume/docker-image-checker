import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { idsEqual } from '@/lib/container-id'
import { listContainersRaw } from '@/lib/docker-inventory'
import { writeFileAtomic } from '@/lib/fs-atomic'
import type {
	ContainerUpdate,
	FilterStatus,
	NotificationState,
	NotifiedUpdate
} from '@/types/app-state'

export { idsEqual }

// Resolved per call (not at import time). Under NODE_ENV=test (vitest sets it
// automatically) the default lands in the OS temp dir so tests never touch the
// real data/ file; STATE_FILE_PATH still overrides in any environment.
function getStateFilePath(): string {
	if (process.env.STATE_FILE_PATH) return process.env.STATE_FILE_PATH
	if (process.env.NODE_ENV === 'test') {
		return path.join(
			os.tmpdir(),
			'docker-image-checker-test',
			'dashboard-state.json'
		)
	}
	return path.join(process.cwd(), 'data', 'dashboard-state.json')
}

/**
 * B-16: orphan GC must validate liveness against the daemon, never against a
 * client- or cache-derived list — within the cacheComponents stale window the
 * cached inventory misses recently created containers and GC would purge the
 * preferences of live ones.
 */
export async function collectLiveContainerIds(): Promise<string[]> {
	const containers = await listContainersRaw()
	return containers.map((c) => c.Id)
}

// Serialize every read-modify-write cycle on the state file so concurrent
// mutations (e.g. the notification scheduler racing a dashboard settings
// save) cannot observe stale state and overwrite each other's changes.
// writeFileAtomic only serializes writes, not the load → mutate → save cycle.
const stateStore = globalThis as unknown as {
	__appStateMutex?: Promise<unknown>
}
stateStore.__appStateMutex ??= Promise.resolve()

export function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
	const mutex = stateStore.__appStateMutex as Promise<unknown>
	const result = mutex.then(operation)
	stateStore.__appStateMutex = result.catch(() => {})
	return result
}

/**
 * Generate a unique ID for a container update
 * Format: containerName:imageName:latestDigest
 */
export function generateContainerId(update: ContainerUpdate): string {
	return `${update.containerName}:${update.imageName}:${update.latestDigest}`
}

/**
 * Load notification state from JSON file. A corrupt file is moved aside to
 * `<file>.corrupt-<timestamp>` so the next save does not silently destroy
 * whatever state was recoverable from it.
 */
export async function loadState(): Promise<NotificationState> {
	try {
		// Ensure data directory exists
		const dataDir = path.dirname(getStateFilePath())
		await fs.mkdir(dataDir, { recursive: true })

		// Try to read existing state
		const data = await fs.readFile(getStateFilePath(), 'utf-8')
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
			try {
				const backupPath = `${getStateFilePath()}.corrupt-${Date.now()}`
				await fs.rename(getStateFilePath(), backupPath)
				console.error(`Corrupt app state file moved aside: ${backupPath}`)
			} catch {
				// Rename is best-effort; fall through to the empty state
			}
		}
		return { notifiedUpdates: {} }
	}
}

/**
 * Save notification state to JSON file
 */
export async function saveState(state: NotificationState): Promise<void> {
	try {
		// Atomic write (temp + rename); creates the data directory if missing
		await writeFileAtomic(getStateFilePath(), JSON.stringify(state, null, 2))
		console.log('App state saved successfully')
	} catch (error) {
		const err = error as NodeJS.ErrnoException
		if (err.code === 'EACCES') {
			console.error(
				`Error saving app state: Permission denied at ${getStateFilePath()}.`
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
 * B-07: dedup gate at send time. A concurrent check round may have marked
 * this update after our round-start snapshot was taken; re-read the state
 * under the store mutex so overlapping rounds cannot duplicate sends.
 */
export async function alreadyNotifiedFresh(
	update: ContainerUpdate
): Promise<boolean> {
	return runExclusive(async () => {
		const state = await loadState()
		return hasBeenNotified(state, update)
	})
}

/**
 * Mark an update as notified
 */
export async function markAsNotified(update: ContainerUpdate): Promise<void> {
	return runExclusive(async () => {
		const state = await loadState()
		const containerId = generateContainerId(update)

		const notifiedUpdate: NotifiedUpdate = {
			notifiedAt: Temporal.Now.instant().toString(),
			containerName: update.containerName,
			imageName: update.imageName,
			latestVersion: update.latestVersion,
			latestDigest: update.latestDigest
		}

		state.notifiedUpdates[containerId] = notifiedUpdate
		state.lastCheck = Temporal.Now.instant().toString()

		await saveState(state)
	})
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
	return runExclusive(async () => {
		const state = await loadState()
		const cutoffInstant = Temporal.Now.instant()
			.toZonedDateTimeISO('UTC')
			.subtract({ days: daysOld })
			.toInstant()

		const filteredUpdates: Record<string, NotifiedUpdate> = {}

		for (const [key, value] of Object.entries(state.notifiedUpdates)) {
			const notifiedInstant = Temporal.Instant.from(value.notifiedAt)
			if (Temporal.Instant.compare(notifiedInstant, cutoffInstant) > 0) {
				filteredUpdates[key] = value
			}
		}

		state.notifiedUpdates = filteredUpdates
		await saveState(state)

		console.log(`Cleared notifications older than ${daysOld} days`)
	})
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
	return runExclusive(async () => {
		const state = await loadState()
		state.hiddenContainerIds = ids
		await saveState(state)
	})
}

export async function isContainerHidden(containerId: string): Promise<boolean> {
	const hiddenIds = await getHiddenContainerIds()
	return hiddenIds.some((id) => idsEqual(id, containerId))
}

export async function remapHiddenIds(
	oldId: string,
	newId: string
): Promise<void> {
	if (!oldId || !newId || idsEqual(oldId, newId)) return
	return runExclusive(async () => {
		const state = await loadState()
		const list = state.hiddenContainerIds || []
		const oldIdx = list.findIndex((id) => idsEqual(id, oldId))
		if (oldIdx === -1) return
		const newIdx = list.findIndex((id) => idsEqual(id, newId))
		let next: string[]
		if (newIdx !== -1) {
			next = list.filter((_, i) => i !== oldIdx)
		} else {
			next = [...list]
			next[oldIdx] = newId
		}
		if (next.length === list.length && next.every((v, i) => v === list[i])) {
			return
		}
		state.hiddenContainerIds = next
		await saveState(state)
	})
}

export async function gcHiddenIds(liveIds: string[]): Promise<boolean> {
	return runExclusive(async () => {
		const state = await loadState()
		const list = state.hiddenContainerIds || []
		const filtered = list.filter((id) =>
			liveIds.some((live) => idsEqual(live, id))
		)
		if (
			filtered.length === list.length &&
			filtered.every((v, i) => v === list[i])
		) {
			return false
		}
		state.hiddenContainerIds = filtered
		await saveState(state)
		return true
	})
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
	return runExclusive(async () => {
		const state = await loadState()
		state.ignoredNotificationIds = ids
		await saveState(state)
	})
}

/**
 * Check if a container has notifications ignored
 */
export async function isContainerIgnored(
	containerId: string
): Promise<boolean> {
	const ignoredIds = await getIgnoredNotificationContainerIds()
	return ignoredIds.some((id) => idsEqual(id, containerId))
}

export async function remapIgnoredIds(
	oldId: string,
	newId: string
): Promise<void> {
	if (!oldId || !newId || idsEqual(oldId, newId)) return
	return runExclusive(async () => {
		const state = await loadState()
		const list = state.ignoredNotificationIds || []
		const oldIdx = list.findIndex((id) => idsEqual(id, oldId))
		if (oldIdx === -1) return
		const newIdx = list.findIndex((id) => idsEqual(id, newId))
		let next: string[]
		if (newIdx !== -1) {
			next = list.filter((_, i) => i !== oldIdx)
		} else {
			next = [...list]
			next[oldIdx] = newId
		}
		if (next.length === list.length && next.every((v, i) => v === list[i])) {
			return
		}
		state.ignoredNotificationIds = next
		await saveState(state)
	})
}

export async function gcIgnoredIds(liveIds: string[]): Promise<boolean> {
	return runExclusive(async () => {
		const state = await loadState()
		const list = state.ignoredNotificationIds || []
		const filtered = list.filter((id) =>
			liveIds.some((live) => idsEqual(live, id))
		)
		if (
			filtered.length === list.length &&
			filtered.every((v, i) => v === list[i])
		) {
			return false
		}
		state.ignoredNotificationIds = filtered
		await saveState(state)
		return true
	})
}

/**
 * Get preferred language for notifications
 */
export async function getPreferredLanguage(): Promise<string> {
	const state = await loadState()
	return process.env.NOTIFICATIONS_LANGUAGE || state.preferredLanguage || 'en'
}

/**
 * Set preferred language for notifications
 */
export async function setPreferredLanguage(language: string): Promise<void> {
	return runExclusive(async () => {
		const state = await loadState()
		state.preferredLanguage = language
		await saveState(state)
	})
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
	return runExclusive(async () => {
		const state = await loadState()
		if (settings.activeFilters !== undefined) {
			state.activeFilters = settings.activeFilters
		}
		if (settings.showHiddenMode !== undefined) {
			state.showHiddenMode = settings.showHiddenMode
		}
		await saveState(state)
	})
}
