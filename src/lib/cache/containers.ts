import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PolicyState } from '@/lib/policies/types'

const CACHE_FILE_PATH = path.join(
	process.cwd(),
	'data',
	'containers-cache.json'
)

export interface CachedContainerResult {
	/** Image name including tag, used as key */
	imageName: string
	/** Local digest at time of last check */
	localDigest: string
	/** Resolved update status */
	updateStatus: 'updated' | 'available' | 'local' | 'unknown'
	/** Current version string as extracted from registry */
	currentVersion?: string
	/** Display-friendly version string */
	displayCurrentVersion: string
	/** Latest version available on the registry */
	latestVersion?: string
	/** ISO string of when the remote image was last updated */
	lastUpdated?: string
	/** URL to Docker Hub / GHCR for this image */
	dockerHubUrl?: string
	/** Whether the local image is up to date */
	isUpToDate: boolean
	/** Policy state from the version engine */
	policyState?: PolicyState
	/** ISO string of when this cache entry was last written */
	cachedAt: string
}

export type ContainersCache = Record<string, CachedContainerResult>

async function ensureDataDir() {
	const dir = path.dirname(CACHE_FILE_PATH)
	await fs.mkdir(dir, { recursive: true })
}

/**
 * Get the cache key for a container. Uses imageName + localDigest so that
 * when the local image changes (pulled), the old cache is ignored.
 */
export function getCacheKey(imageName: string, localDigest: string): string {
	return `${imageName}::${localDigest}`
}

export async function loadContainersCache(): Promise<ContainersCache> {
	try {
		await ensureDataDir()
		const data = await fs.readFile(CACHE_FILE_PATH, 'utf-8')
		return JSON.parse(data) as ContainersCache
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error('[ContainersCache] Error loading cache:', error)
		}
		return {}
	}
}

let cacheMutex = Promise.resolve()

export async function saveContainersCache(
	cache: ContainersCache
): Promise<void> {
	const operation = cacheMutex.then(async () => {
		try {
			await ensureDataDir()
			const tempPath = `${CACHE_FILE_PATH}.tmp`
			await fs.writeFile(tempPath, JSON.stringify(cache, null, 2), 'utf-8')
			await fs.rename(tempPath, CACHE_FILE_PATH)
		} catch (error) {
			console.error('[ContainersCache] Error saving cache:', error)
		}
	})
	cacheMutex = operation
	return operation
}
