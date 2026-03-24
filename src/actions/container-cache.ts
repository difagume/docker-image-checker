'use server'

import type {
	CachedContainerResult,
	ContainersCache
} from '@/lib/cache/containers'
import {
	getCacheKey,
	loadContainersCache,
	saveContainersCache
} from '@/lib/cache/containers'

export async function loadContainersCacheAction(): Promise<
	Record<string, CachedContainerResult>
> {
	return loadContainersCache()
}

export async function saveAllContainersCacheAction(
	cache: ContainersCache
): Promise<void> {
	return saveContainersCache(cache)
}

export async function updateContainerCacheAction(
	imageName: string,
	localDigest: string,
	updateInfo: Partial<CachedContainerResult>
): Promise<void> {
	const cache = await loadContainersCache()
	const cacheKey = getCacheKey(imageName, localDigest)

	cache[cacheKey] = {
		imageName,
		localDigest,
		updateStatus: 'updated',
		displayCurrentVersion:
			updateInfo.displayCurrentVersion || imageName.split(':')[1] || 'latest',
		isUpToDate: true,
		cachedAt: new Date().toISOString(),
		...updateInfo
	}

	return saveContainersCache(cache)
}
