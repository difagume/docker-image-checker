import type { ContainerInfo, ImageInfo } from 'dockerode'
import { unstable_cache } from 'next/cache'
import docker from '@/lib/docker'

// ── Raw readers (always fresh, throw on error) ────────────────

/**
 * Lists all Docker containers by querying the daemon directly.
 * Throws on error — callers must handle failures.
 */
export async function listContainersRaw(): Promise<ContainerInfo[]> {
	const containers = await docker.listContainers({ all: true })
	return JSON.parse(JSON.stringify(containers))
}

/**
 * Lists all Docker images by querying the daemon directly.
 * Throws on error — callers must handle failures.
 */
export async function listImagesRaw(): Promise<ImageInfo[]> {
	const images = await docker.listImages()
	return JSON.parse(JSON.stringify(images))
}

/**
 * Pings the Docker daemon to verify connectivity.
 * Throws on error — callers must handle failures.
 */
export async function pingDockerRaw(): Promise<boolean> {
	await docker.ping()
	return true
}

// ── Cached wrappers (stale-while-revalidate via unstable_cache) ──

function cacheKey(...parts: string[]) {
	return ['docker-inventory', ...parts]
}

/**
 * Returns cached container list. On cache miss or expiry, re-scans the daemon.
 * Throws on error — the cache never stores error states.
 */
export const getContainers = unstable_cache(
	async (): Promise<ContainerInfo[]> => {
		return listContainersRaw()
	},
	cacheKey('containers'),
	{
		tags: ['docker:containers'],
		revalidate: 300 // 5 minutes
	}
)

/**
 * Returns cached image list. On cache miss or expiry, re-scans the daemon.
 * Throws on error — the cache never stores error states.
 */
export const getImages = unstable_cache(
	async (): Promise<ImageInfo[]> => {
		return listImagesRaw()
	},
	cacheKey('images'),
	{
		tags: ['docker:images'],
		revalidate: 300 // 5 minutes
	}
)

/**
 * Returns cached daemon connectivity status. On cache miss or expiry, re-pings.
 * Throws on error — the cache never stores error states.
 */
export const getDockerConnected = unstable_cache(
	async (): Promise<boolean> => {
		return pingDockerRaw()
	},
	cacheKey('connection'),
	{
		tags: ['docker:connection'],
		revalidate: 10 // 10 seconds
	}
)
