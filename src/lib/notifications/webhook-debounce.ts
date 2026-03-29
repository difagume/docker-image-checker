// Simple in-memory debounce with 30s TTL
const updateLocks = new Map<string, number>()

const DEBOUNCE_MS = 30 * 1000 // 30 seconds

/**
 * Check if an update is currently in progress for a container.
 * Automatically clears expired entries.
 */
export function isUpdateInProgress(containerId: string): boolean {
	const timestamp = updateLocks.get(containerId)
	if (!timestamp) return false
	if (Date.now() - timestamp > DEBOUNCE_MS) {
		updateLocks.delete(containerId)
		return false
	}
	return true
}

/**
 * Mark a container as currently updating.
 * Sets a timestamp that expires after 30 seconds.
 */
export function markUpdateInProgress(containerId: string): void {
	updateLocks.set(containerId, Date.now())
}

/**
 * Clear the update progress lock for a container.
 * Use this after update completes or fails.
 */
export function clearUpdateProgress(containerId: string): void {
	updateLocks.delete(containerId)
}
