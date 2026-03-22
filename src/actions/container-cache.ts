'use server'

import type {
	CachedContainerResult,
	ContainersCache
} from '@/lib/cache/containers'
import {
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
