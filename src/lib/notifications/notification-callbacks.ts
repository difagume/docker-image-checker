// Persistent storage for pending notification callbacks
// Uses short IDs to fit Telegram's 64-byte callback_data limit
// All operations read/write directly to JSON file (no in-memory cache)

import fs from 'node:fs'
import path from 'node:path'

interface CallbackData {
	containerId: string
	fullImageName: string
	locale: string
	createdAt: number // timestamp for TTL
}

interface PersistentCallbacks {
	version: number
	callbacks: Record<string, CallbackData>
}

const CALLBACK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CALLBACKS_FILE = path.join(
	process.cwd(),
	'data',
	'telegram-callbacks.json'
)
const MAX_CALLBACKS = 1000

/**
 * Read all callbacks from JSON file
 */
function readAllCallbacks(): Record<string, CallbackData> {
	try {
		if (fs.existsSync(CALLBACKS_FILE)) {
			const data = fs.readFileSync(CALLBACKS_FILE, 'utf-8')
			const parsed: PersistentCallbacks = JSON.parse(data)
			return parsed.callbacks || {}
		}
	} catch (error) {
		console.error('[Callbacks] Failed to read callbacks:', error)
	}
	return {}
}

/**
 * Write all callbacks to JSON file
 */
function writeAllCallbacks(callbacks: Record<string, CallbackData>): void {
	try {
		const dir = path.dirname(CALLBACKS_FILE)
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true })
		}
		const data: PersistentCallbacks = {
			version: 1,
			callbacks
		}
		fs.writeFileSync(CALLBACKS_FILE, JSON.stringify(data, null, 2))
	} catch (error) {
		console.error('[Callbacks] Failed to save callbacks:', error)
	}
}

/**
 * Generate a short unique ID for callback data using crypto API
 */
function generateShortId(): string {
	return crypto.randomUUID().slice(0, 8)
}

/**
 * Store callback data and return a short ID to use in callback_data
 */
export function storeCallbackData(
	containerId: string,
	fullImageName: string,
	locale: string
): string {
	let callbacks = readAllCallbacks()
	const shortId = generateShortId()
	const createdAt = Date.now()

	callbacks[shortId] = {
		containerId,
		fullImageName,
		locale,
		createdAt
	}

	// Clean up old entries if we have too many
	if (Object.keys(callbacks).length > MAX_CALLBACKS) {
		const now = Date.now()
		for (const [id, cb] of Object.entries(callbacks)) {
			if (now - cb.createdAt > CALLBACK_TTL_MS) {
				delete callbacks[id]
			}
		}
		// If still too many, remove oldest entries
		if (Object.keys(callbacks).length > MAX_CALLBACKS) {
			const entries = Object.entries(callbacks)
				.sort((a, b) => a[1].createdAt - b[1].createdAt)
				.slice(0, MAX_CALLBACKS / 2)
			callbacks = Object.fromEntries(entries)
		}
	}

	writeAllCallbacks(callbacks)

	return shortId
}

/**
 * Retrieve callback data by short ID
 * Returns null if not found or expired
 * Note: Does NOT delete - caller must call removeCallbackData after successful use
 */
export function getCallbackData(shortId: string): CallbackData | null {
	const callbacks = readAllCallbacks()

	const data = callbacks[shortId]
	if (!data) {
		return null
	}

	// Check if expired
	const age = Date.now() - data.createdAt
	if (age > CALLBACK_TTL_MS) {
		delete callbacks[shortId]
		writeAllCallbacks(callbacks)
		return null
	}

	return data
}

/**
 * Remove callback data after use (successful update)
 */
export function removeCallbackData(shortId: string): void {
	const callbacks = readAllCallbacks()

	if (callbacks[shortId]) {
		delete callbacks[shortId]
		writeAllCallbacks(callbacks)
	}
}

/**
 * Get all pending callbacks (for debugging)
 */
export function getPendingCallbacksCount(): number {
	const callbacks = readAllCallbacks()
	return Object.keys(callbacks).length
}

/**
 * Remove all callbacks for a specific container
 * Useful when the container is updated from the web UI
 */
export function removeCallbacksByContainerId(containerId: string): number {
	const callbacks = readAllCallbacks()

	let removed = 0
	for (const [id, data] of Object.entries(callbacks)) {
		if (data.containerId === containerId) {
			delete callbacks[id]
			removed++
		}
	}

	if (removed > 0) {
		writeAllCallbacks(callbacks)
	}

	return removed
}

/**
 * Check if any callbacks exist for a specific container
 */
export function hasCallbacksForContainer(containerId: string): boolean {
	const callbacks = readAllCallbacks()

	for (const data of Object.values(callbacks)) {
		if (data.containerId === containerId) {
			return true
		}
	}
	return false
}
