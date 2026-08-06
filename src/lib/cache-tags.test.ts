import { describe, expect, it } from 'vitest'

import {
	CACHE_TAGS,
	CONNECTION_CACHE_PROFILE,
	INVENTORY_CACHE_PROFILE,
	REFRESH_TAGS,
	REGISTRY_EXPIRE_SECONDS,
	REGISTRY_REVALIDATE_SECONDS
} from './cache-tags'

describe('cache-tags', () => {
	it('declares the 4 expected cache tags with docker:* namespacing', () => {
		expect(CACHE_TAGS.containers).toBe('docker:containers')
		expect(CACHE_TAGS.images).toBe('docker:images')
		expect(CACHE_TAGS.connection).toBe('docker:connection')
		expect(CACHE_TAGS.registry).toBe('registry:checks')
	})

	it('exposes exactly 4 distinct refresh tags matching the declared tags', () => {
		expect(REFRESH_TAGS).toHaveLength(4)
		const declared: Set<string> = new Set([
			CACHE_TAGS.containers,
			CACHE_TAGS.images,
			CACHE_TAGS.connection,
			CACHE_TAGS.registry
		])
		for (const tag of REFRESH_TAGS) {
			expect(declared.has(tag)).toBe(true)
		}
		expect(new Set(REFRESH_TAGS).size).toBe(4)
	})

	it('declares the inventory and connection cache profiles', () => {
		expect(INVENTORY_CACHE_PROFILE).toBe('minutes')
		expect(CONNECTION_CACHE_PROFILE).toBe('seconds')
	})

	it('declares the registry cacheLife timings', () => {
		expect(REGISTRY_REVALIDATE_SECONDS).toBe(900)
		expect(REGISTRY_EXPIRE_SECONDS).toBe(3600)
	})
})
