// Persistent storage for pending notification callbacks.
// Short IDs fit Telegram's 64-byte callback_data limit. All operations are
// async, atomic (writeFileAtomic), and serialized through a module-level
// mutex so concurrent read-modify-write cycles never drop entries.

import fs from 'node:fs/promises'
import path from 'node:path'

import { writeFileAtomic } from '@/lib/fs-atomic'

export interface CallbackData {
	containerId: string
	fullImageName: string
	locale: string
	createdAt: number // timestamp for TTL
	// Message info persisted by the provider at send time so the poller can
	// keep the original container/image/version block visible across edits
	// and rebuild it with the post-update version on success.
	containerName?: string
	imageName?: string
	currentVersion?: string
	latestVersion?: string
	dockerHubUrl?: string
	referenceUrl?: string
	lastUpdated?: string
	// Coordinates of the exact sent message (filled after sendMessage).
	chatId?: number
	messageId?: number
}

export interface StoreCallbackOptions {
	containerName?: string
	imageName?: string
	currentVersion?: string
	latestVersion?: string
	dockerHubUrl?: string
	referenceUrl?: string
	lastUpdated?: string
}

export interface PersistentCallbacks {
	version: number
	callbacks: Record<string, CallbackData>
}

const CALLBACK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_CALLBACKS = 1000

function getCallbacksFile(): string {
	return (
		process.env.TELEGRAM_CALLBACKS_FILE ||
		path.join(process.cwd(), 'data', 'telegram-callbacks.json')
	)
}

async function readAllCallbacks(
	file: string
): Promise<Record<string, CallbackData>> {
	try {
		const raw = await fs.readFile(file, 'utf-8')
		const parsed: PersistentCallbacks = JSON.parse(raw)
		return parsed.callbacks || {}
	} catch {
		return {}
	}
}

async function writeAllCallbacks(
	file: string,
	callbacks: Record<string, CallbackData>
): Promise<void> {
	const data: PersistentCallbacks = {
		version: 1,
		callbacks
	}
	await writeFileAtomic(file, JSON.stringify(data, null, 2))
}

// Serialize every read-modify-write cycle on the store so concurrent calls
// cannot observe stale state and overwrite each other's entries.
let mutex: Promise<unknown> = Promise.resolve()

function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
	const result = mutex.then(operation)
	mutex = result.catch(() => {})
	return result
}

function generateShortId(): string {
	return crypto.randomUUID().slice(0, 8)
}

/**
 * Store callback data and return a short ID to use in callback_data.
 * `options` carries the base message info (labels are re-resolved from the
 * stored locale by the poller) used to keep the original info visible while
 * the inline-button edits progress.
 */
export function storeCallbackData(
	containerId: string,
	fullImageName: string,
	locale: string,
	options: StoreCallbackOptions = {}
): Promise<string> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)
		const shortId = generateShortId()
		const createdAt = Date.now()

		callbacks[shortId] = {
			containerId,
			fullImageName,
			locale,
			createdAt,
			containerName: options.containerName,
			imageName: options.imageName,
			currentVersion: options.currentVersion,
			latestVersion: options.latestVersion,
			dockerHubUrl: options.dockerHubUrl,
			referenceUrl: options.referenceUrl,
			lastUpdated: options.lastUpdated
		}

		// Clean up old entries if we have too many
		if (Object.keys(callbacks).length > MAX_CALLBACKS) {
			const now = Date.now()
			for (const [id, cb] of Object.entries(callbacks)) {
				if (now - cb.createdAt > CALLBACK_TTL_MS) {
					delete callbacks[id]
				}
			}
			// If still too many, evict the oldest entries
			const overflow = Object.keys(callbacks).length - MAX_CALLBACKS
			if (overflow > 0) {
				const oldest = Object.entries(callbacks)
					.sort((a, b) => a[1].createdAt - b[1].createdAt)
					.slice(0, overflow)
				for (const [id] of oldest) {
					delete callbacks[id]
				}
			}
		}

		await writeAllCallbacks(file, callbacks)

		return shortId
	})
}

/**
 * Retrieve callback data by short ID. Returns null if not found or expired.
 * Does NOT delete on success — the caller must call removeCallbackData after
 * the update resolves.
 */
export function getCallbackData(shortId: string): Promise<CallbackData | null> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)

		const data = callbacks[shortId]
		if (!data) {
			return null
		}

		// Check if expired
		const age = Date.now() - data.createdAt
		if (age > CALLBACK_TTL_MS) {
			delete callbacks[shortId]
			await writeAllCallbacks(file, callbacks)
			return null
		}

		return data
	})
}

/**
 * Remove callback data after use (successful update).
 */
export function removeCallbackData(shortId: string): Promise<void> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)

		if (callbacks[shortId]) {
			delete callbacks[shortId]
			await writeAllCallbacks(file, callbacks)
		}
	})
}

/**
 * Attach the coordinates of the sent message to a stored callback. The
 * provider knows them only after `sendMessage` resolves, so this runs as a
 * second step. The poller prefers these over the tap metadata so edits always
 * target the exact message that carried the button.
 */
export function updateCallbackMessageData(
	shortId: string,
	coords: { chatId: number; messageId: number }
): Promise<void> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)
		const data = callbacks[shortId]
		if (!data) return
		data.chatId = coords.chatId
		data.messageId = coords.messageId
		await writeAllCallbacks(file, callbacks)
	})
}

/**
 * Get the number of pending callbacks (for debugging).
 */
export function getPendingCallbacksCount(): Promise<number> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)
		return Object.keys(callbacks).length
	})
}

/**
 * Remove all callbacks for a specific container. Used when the container is
 * updated from the web UI so stale inline buttons stop working.
 * Returns the number of callbacks removed.
 */
export function clearContainerCallbacks(containerId: string): Promise<number> {
	const file = getCallbacksFile()
	return runExclusive(async () => {
		const callbacks = await readAllCallbacks(file)

		let removed = 0
		for (const [id, data] of Object.entries(callbacks)) {
			if (data.containerId === containerId) {
				delete callbacks[id]
				removed++
			}
		}

		if (removed > 0) {
			await writeAllCallbacks(file, callbacks)
		}

		return removed
	})
}
