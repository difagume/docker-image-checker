import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseImageReference } from '@/lib/image-name'
import { evaluatePolicies } from '@/lib/policies/engine'
import type { CheckImageUpdateResult } from '@/lib/registry-updates'
import {
	classifyRegistryError,
	resolveUpdateStatus
} from '@/lib/registry-updates'

describe('B-01 resolveLocalDigest (ImageID fallback)', () => {
	it('returns undefined for empty RepoDigests, not ImageID', async () => {
		// Dynamic import after fix
		const mod = await import('@/lib/image-name')
		const fn = (
			mod as unknown as {
				resolveLocalDigest?: (img: unknown) => string | undefined
			}
		).resolveLocalDigest
		expect(fn).toBeDefined()
		expect(fn!({ RepoDigests: [] } as unknown as never)).toBeUndefined()
		expect(fn!({ RepoDigests: undefined } as unknown as never)).toBeUndefined()
		expect(fn!(undefined)).toBeUndefined()
		expect(
			fn!({ RepoDigests: ['nginx@sha256:abc123'] } as unknown as never)
		).toBe('sha256:abc123')
	})

	it('FROM scratch with latest and empty digest must NOT be CONTENT_UPDATED', () => {
		const ctx = {
			imageName: 'my-scratch:latest',
			currentTag: 'latest',
			currentDigest: '',
			remoteTags: [
				{ tag: 'latest', digest: 'sha256:remote123', publishedAt: '2024-01-01' }
			]
		}
		const r = evaluatePolicies(ctx as never)
		expect(r.state).not.toBe('CONTENT_UPDATED')
	})
})

describe('B-05 parseImageReference (registry port + digest)', () => {
	it('parses registry with port: registry.local:5000/myrepo:1.2.3', () => {
		const ref = parseImageReference('registry.local:5000/myrepo:1.2.3')
		expect(ref.repository).toBe('registry.local:5000/myrepo')
		expect(ref.tag).toBe('1.2.3')
		expect(ref.isDigest).toBe(false)
	})

	it('parses digest-pinned reference isDigest true', () => {
		const ref = parseImageReference('myorg/app@sha256:abc123')
		expect(ref.repository).toBe('myorg/app')
		expect(ref.tag).toBe('sha256:abc123')
		expect(ref.isDigest).toBe(true)
	})

	it('checkImageUpdateRaw uses parseImageReference for port repo (no split colon)', async () => {
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const originalFetch = global.fetch
		let fetchedUrl = ''
		global.fetch = vi.fn(async (url: string) => {
			fetchedUrl = url
			return {
				ok: true,
				json: async () => ({
					results: [
						{ name: '1.2.3', digest: 'sha256:abc', last_updated: '2024-01-01' }
					]
				})
			} as unknown as Response
		}) as unknown as typeof fetch
		try {
			await checkImageUpdateRaw(
				'registry.local:5000/myrepo:1.2.3',
				'sha256:abc'
			)
			// Should have fetched stripped original? For this registry it's not lscr.io so repo is registry.local:5000/myrepo -> but current buggy split would request library/registry.local
			// After fix it should correctly handle port; we check URL contains the right repo
			expect(fetchedUrl).toContain('registry.local:5000/myrepo')
			// Before fix split(':') gives repo='registry.local' -> URL would be library/registry.local -> fail
			// So assert not containing the buggy form
			expect(fetchedUrl).not.toBe(
				'https://hub.docker.com/v2/repositories/library/registry.local/tags?page_size=70'
			)
		} finally {
			global.fetch = originalFetch
		}
	})
})

describe('B-10 Hub unknown tag -> unknown (not green updated)', () => {
	let originalFetch: typeof fetch
	beforeEach(() => {
		originalFetch = global.fetch
	})
	afterEach(() => {
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it('redis:tag-inventado absent -> policy UNKNOWN, latestDigest undefined, mapper unknown', async () => {
		// Mock Hub tags without tag-inventado
		global.fetch = vi.fn(
			async () =>
				({
					ok: true,
					json: async () => ({
						results: [
							{ name: '7.2', digest: 'sha256:72', last_updated: '2024-01-01' },
							{
								name: 'latest',
								digest: 'sha256:latest',
								last_updated: '2024-01-02'
							}
						]
					})
				}) as unknown as Response
		) as unknown as typeof fetch

		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkImageUpdateRaw(
			'redis:tag-inventado',
			'sha256:local'
		)

		expect(result.policyResult?.state).toBe('UNKNOWN_TAG_STRATEGY')
		expect(result.latestDigest).toBeUndefined()
		expect(result.lastUpdated).toBeUndefined()
		// Mapper logic: isLocal?local:latestDigest?available/updated:unknown
		const isLocal = !!result.isLocal
		let updateStatus: string = 'unknown'
		if (isLocal) updateStatus = 'local'
		else if (result.latestDigest)
			updateStatus = result.hasUpdate ? 'available' : 'updated'
		expect(updateStatus).toBe('unknown')
		expect(updateStatus).not.toBe('updated')
		// B-04: a missing tag is not-found, never transient (spec: 404 rules unchanged).
		expect(result.transient).toBeFalsy()
	})

	it('GHCR parity: ghcr.io/owner/repo:unknown-tag absent -> unknown', async () => {
		process.env.GITHUB_GHCR_TOKEN = 'test-token'
		// Mock GHCR API to return versions without unknown-tag
		// Provide two endpoints, mock fetch to respond based on URL
		global.fetch = vi.fn(async (url: string) => {
			if (url.includes('api.github.com')) {
				return {
					ok: true,
					json: async () => [
						{
							id: 1,
							name: 'sha256:111',
							updated_at: '2024-01-01T00:00:00Z',
							metadata: {
								package_type: 'container',
								container: { tags: ['v1.0.0', 'latest'] }
							}
						}
					]
				} as unknown as Response
			}
			return { ok: false, status: 404 } as unknown as Response
		}) as unknown as typeof fetch
		const { checkGhcrUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkGhcrUpdateRaw(
			'ghcr.io/owner/repo:unknown-tag',
			'sha256:local'
		)
		expect(result.policyResult?.state).toBe('UNKNOWN_TAG_STRATEGY')
		expect(result.latestDigest).toBeUndefined()
		const isLocal = !!result.isLocal
		let updateStatus: string = 'unknown'
		if (isLocal) updateStatus = 'local'
		else if (result.latestDigest)
			updateStatus = result.hasUpdate ? 'available' : 'updated'
		expect(updateStatus).toBe('unknown')
		// B-04: GHCR 404 endpoints are not-found/invalid_token, never transient.
		expect(result.transient).toBeFalsy()
	})
})

describe('B-11 canonical Hub links for official images', () => {
	async function withTagsFetch<T>(fn: () => Promise<T>): Promise<T> {
		const originalFetch = global.fetch
		global.fetch = vi.fn(
			async () =>
				({
					ok: true,
					json: async () => ({
						results: [
							{ name: '8.4.0', digest: 'sha256:a', last_updated: '2024-01-01' },
							{ name: '8.10.1', digest: 'sha256:b', last_updated: '2024-06-01' }
						]
					})
				}) as unknown as Response
		) as unknown as typeof fetch
		try {
			return await fn()
		} finally {
			global.fetch = originalFetch
		}
	}

	it('official image (no owner) links to /_/redis, not /r/library/redis', async () => {
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		await withTagsFetch(async () => {
			const r = await checkImageUpdateRaw('redis:8.4.0', 'sha256:local')
			expect(r.dockerHubUrl).toBe('https://hub.docker.com/_/redis')
		})
	})

	it('namespaced image keeps /r/{owner}/{repo}/tags', async () => {
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		await withTagsFetch(async () => {
			const r = await checkImageUpdateRaw('valkey/valkey:9.0.3-alpine')
			expect(r.dockerHubUrl).toBe('https://hub.docker.com/r/valkey/valkey/tags')
		})
	})
})

// ── B-04 / fix-provider-robustness: transient verdict classification ──────

describe('classifyRegistryError (B-04 / fix-provider-robustness)', () => {
	it('classifies a fetchWithTimeout abort as transient', () => {
		const error = new Error('Timeout after 8000ms')
		expect(classifyRegistryError(error)).toBe(true)
	})

	it('classifies a network TypeError (fetch/DNS) as transient', () => {
		const error = new TypeError('fetch failed')
		expect(classifyRegistryError(error)).toBe(true)
	})

	it('classifies an HTTP 429 rate-limit error as transient', () => {
		const error = new Error('Docker Hub API rate limited (429)')
		expect(classifyRegistryError(error)).toBe(true)
	})

	it('does not classify an arbitrary error as transient', () => {
		const error = new Error('Docker Hub API error: Internal Server Error')
		expect(classifyRegistryError(error)).toBe(false)
	})

	it('does not classify non-Error values as transient', () => {
		expect(classifyRegistryError('Timeout after 8000ms')).toBe(false)
		expect(classifyRegistryError(undefined)).toBe(false)
	})
})

describe('resolveUpdateStatus (closed status vocabulary)', () => {
	const COMBOS: Array<{
		name: string
		result: CheckImageUpdateResult
		expected: 'local' | 'updated' | 'available' | 'unknown' | 'transient'
	}> = [
		{
			name: 'local image',
			result: { hasUpdate: false, isLocal: true },
			expected: 'local'
		},
		{
			name: 'up to date',
			result: { hasUpdate: false, isLocal: false, latestDigest: 'sha256:a' },
			expected: 'updated'
		},
		{
			name: 'update available',
			result: { hasUpdate: true, isLocal: false, latestDigest: 'sha256:b' },
			expected: 'available'
		},
		{
			name: 'no digest, not transient → unknown',
			result: { hasUpdate: false, isLocal: false },
			expected: 'unknown'
		},
		{
			name: 'no digest, transient → transient',
			result: { hasUpdate: false, isLocal: false, transient: true },
			expected: 'transient'
		}
	]

	it('maps every digest/verdict combo to the closed vocabulary, never "checking"', () => {
		expect(COMBOS.length).toBeGreaterThan(0)
		for (const combo of COMBOS) {
			const status = resolveUpdateStatus(combo.result)
			expect(status).toBe(combo.expected)
			expect(status).not.toBe('checking')
		}
	})
})
