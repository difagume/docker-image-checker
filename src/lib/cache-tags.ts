/**
 * Single source of truth for the cache tags and cacheLife profiles used by the
 * Cache Components layer (inventory + registry update checks).
 *
 * Tags are re-exported from `next/cache` via `cacheTag()`; the profile names
 * are passed to `cacheLife()`. Keeping them in one module avoids drift between
 * the server-action refresh path and the cached readers.
 */

export const CACHE_TAGS = {
	containers: 'docker:containers',
	images: 'docker:images',
	connection: 'docker:connection',
	registry: 'registry:checks'
} as const

/** All tags that must be revalidated when the user triggers a manual refresh. */
export const REFRESH_TAGS: readonly string[] = [
	CACHE_TAGS.containers,
	CACHE_TAGS.images,
	CACHE_TAGS.connection,
	CACHE_TAGS.registry
]

/** `cacheLife('minutes')` → stale 5min / revalidate 1min / expire 1h. */
export const INVENTORY_CACHE_PROFILE = 'minutes' as const

/** `cacheLife('seconds')` → stale 30s / revalidate 1s / expire 1min (dynamic). */
export const CONNECTION_CACHE_PROFILE = 'seconds' as const

/** Registry checks: revalidate every 15min, expire after 1h (prerenderable). */
export const REGISTRY_REVALIDATE_SECONDS = 900
export const REGISTRY_EXPIRE_SECONDS = 3600
