import { promises as fs } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '@/lib/fs-atomic'

const REFERENCE_URLS_FILE_PATH = path.join(
	process.cwd(),
	'data',
	'reference-urls.json'
)

export interface ReferenceUrlData {
	image: string
	referenceUrl: string
	updatedAt: string
}

export interface ReferenceUrlState {
	referenceUrls: Record<string, ReferenceUrlData>
}

/**
 * Load reference URLs from JSON file. A corrupt file is moved aside to
 * `<file>.corrupt-<timestamp>` so the next save does not silently destroy
 * whatever state was recoverable from it.
 */
export async function loadReferenceUrls(): Promise<ReferenceUrlState> {
	try {
		// Ensure data directory exists
		const dataDir = path.dirname(REFERENCE_URLS_FILE_PATH)
		if (dataDir) {
			await fs.mkdir(dataDir, { recursive: true })
		}

		// Try to read existing state
		const data = await fs.readFile(REFERENCE_URLS_FILE_PATH, 'utf-8')
		return JSON.parse(data) as ReferenceUrlState
	} catch (error) {
		// If file doesn't exist or is invalid, return empty state
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('No existing reference URLs found, creating new state')
		} else {
			console.error('Error loading reference URLs:', error)
			try {
				const backupPath = `${REFERENCE_URLS_FILE_PATH}.corrupt-${Date.now()}`
				await fs.rename(REFERENCE_URLS_FILE_PATH, backupPath)
				console.error(`Corrupt reference URLs file moved aside: ${backupPath}`)
			} catch {
				// Rename is best-effort; fall through to the empty state
			}
		}
		return {
			referenceUrls: {}
		}
	}
}

/**
 * Save reference URLs to JSON file
 */
export async function saveReferenceUrls(
	state: ReferenceUrlState
): Promise<void> {
	try {
		// Atomic write (temp + rename); creates the data directory if missing
		await writeFileAtomic(
			REFERENCE_URLS_FILE_PATH,
			JSON.stringify(state, null, 2)
		)
		console.log('Reference URLs saved successfully')
	} catch (error) {
		console.error('Error saving reference URLs:', error)
		throw error
	}
}

/**
 * Update or add a reference URL for an image
 * Note: imageName is the logical image name (e.g. rustfs/rustfs)
 */
export async function saveReferenceUrl(
	imageName: string,
	url: string
): Promise<void> {
	const state = await loadReferenceUrls()

	if (!url) {
		// If URL is empty, remove the entry
		delete state.referenceUrls[imageName]
	} else {
		// Only http(s) URLs are stored: the value ends up in notification
		// links/actions, so other schemes (javascript:, data:, ...) are rejected.
		let parsed: URL
		try {
			parsed = new URL(url)
		} catch {
			throw new Error('Invalid reference URL')
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new Error('Reference URL must use http:// or https://')
		}

		state.referenceUrls[imageName] = {
			image: imageName,
			referenceUrl: url,
			updatedAt: Temporal.Now.instant().toString()
		}
	}

	await saveReferenceUrls(state)
}

/**
 * Get reference URL for a specific image
 */
export async function getReferenceUrl(
	imageName: string
): Promise<string | undefined> {
	const state = await loadReferenceUrls()
	return state.referenceUrls[imageName]?.referenceUrl
}

/**
 * Get all reference URLs
 */
export async function getReferenceUrls(): Promise<
	Record<string, ReferenceUrlData>
> {
	const state = await loadReferenceUrls()
	return state.referenceUrls
}
