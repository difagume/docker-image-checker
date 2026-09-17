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
		expect(ref.tag).toBe('latest')
		expect(ref.digest).toBe('sha256:abc123')
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

describe('Quay.io support (Registry V2 anonymous)', () => {
	let originalFetch: typeof fetch
	beforeEach(() => {
		originalFetch = global.fetch
	})
	afterEach(() => {
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	function mockQuayV2(digests: Record<string, string>) {
		const tagNames = Object.keys(digests)
		const fetchedUrls: string[] = []
		global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			fetchedUrls.push(url)
			if (url.includes('quay.io/v2/auth')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ token: 'quay-anon-token' })
				} as unknown as Response
			}
			if (url.includes('/tags/list')) {
				// Anonymous bearer required on V2 calls
				const auth = (init?.headers as Record<string, string>)?.Authorization
				if (auth !== 'Bearer quay-anon-token') {
					return { ok: false, status: 401 } as unknown as Response
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ name: 'ns/repo', tags: tagNames })
				} as unknown as Response
			}
			if (url.includes('/manifests/')) {
				const requestedTag = url.split('/manifests/')[1]
				const digest = digests[requestedTag]
				if (!digest) {
					return { ok: false, status: 404 } as unknown as Response
				}
				return {
					ok: true,
					status: 200,
					headers: {
						get: (name: string) => {
							if (name.toLowerCase() === 'docker-content-digest') return digest
							if (name.toLowerCase() === 'last-modified')
								return '2024-06-01T00:00:00Z'
							return null
						}
					}
				} as unknown as Response
			}
			return { ok: false, status: 404 } as unknown as Response
		}) as unknown as typeof fetch
		return fetchedUrls
	}

	it('routes quay.io/* through the V2 flow, never Docker Hub', async () => {
		const fetchedUrls = mockQuayV2({ 'v1.0.0': 'sha256:quay111' })
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:v1.0.0',
			'sha256:local'
		)
		expect(fetchedUrls.length).toBeGreaterThan(0)
		expect(fetchedUrls.some((u) => u.includes('hub.docker.com'))).toBe(false)
		expect(
			fetchedUrls.some((u) =>
				u.includes('quay.io/v2/auth?service=quay.io&scope=')
			)
		).toBe(true)
	})

	it('existing tag resolves digest + quay view URL (available/updated)', async () => {
		mockQuayV2({ 'v1.0.0': 'sha256:quay111', latest: 'sha256:quay222' })
		const { checkImageUpdateRaw, resolveUpdateStatus } = await import(
			'@/lib/registry-updates'
		)
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:v1.0.0',
			'sha256:local'
		)
		expect(result.latestDigest).toBe('sha256:quay111')
		expect(result.dockerHubUrl).toBe(
			'https://quay.io/repository/thefrenchghosty/openchamber'
		)
		expect(['available', 'updated']).toContain(resolveUpdateStatus(result))
		expect(result.transient).toBeFalsy()
	})

	it('missing tag -> UNKNOWN_TAG_STRATEGY, no digest, mapper unknown', async () => {
		mockQuayV2({ 'v1.0.0': 'sha256:quay111', latest: 'sha256:quay222' })
		const { checkImageUpdateRaw, resolveUpdateStatus } = await import(
			'@/lib/registry-updates'
		)
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:tag-inventado',
			'sha256:local'
		)
		expect(result.policyResult?.state).toBe('UNKNOWN_TAG_STRATEGY')
		expect(result.latestDigest).toBeUndefined()
		expect(resolveUpdateStatus(result)).toBe('unknown')
		expect(result.transient).toBeFalsy()
	})

	it('missing repo (tags/list 404) -> unknown, never transient', async () => {
		global.fetch = vi.fn(async (url: string) => {
			if (url.includes('quay.io/v2/auth')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ token: 'quay-anon-token' })
				} as unknown as Response
			}
			return { ok: false, status: 404 } as unknown as Response
		}) as unknown as typeof fetch
		const { checkImageUpdateRaw, resolveUpdateStatus } = await import(
			'@/lib/registry-updates'
		)
		const result = await checkImageUpdateRaw(
			'quay.io/someone/no-such-repo:latest',
			'sha256:local'
		)
		expect(result.latestDigest).toBeUndefined()
		expect(resolveUpdateStatus(result)).toBe('unknown')
		expect(result.transient).toBeFalsy()
	})
})
describe('Quay.io card time (lastUpdated via API v1 + config-blob)', () => {
	let originalFetch: typeof fetch
	beforeEach(() => {
		originalFetch = global.fetch
	})
	afterEach(() => {
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	function mockQuayDates(opts: {
		digests: Record<string, string>
		v1Dates?: Record<string, string> | 'fail'
		v1Entries?: Array<{
			name: string
			manifest_digest?: string
			last_modified?: string
			start_ts?: number
		}>
		v1Status?: number
		manifestLastModified?: string | null
		manifestBody?: unknown
		blobCreated?: string | null
		fetchedUrls?: string[]
	}) {
		global.fetch = vi.fn(async (url: string) => {
			opts.fetchedUrls?.push(url)
			if (url.includes('quay.io/v2/auth')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ token: 'quay-anon-token' })
				} as unknown as Response
			}
			if (url.includes('/api/v1/repository/')) {
				if (opts.v1Entries !== undefined) {
					return {
						ok: true,
						status: 200,
						json: async () => ({ tags: opts.v1Entries })
					} as unknown as Response
				}
				if (opts.v1Status !== undefined) {
					return {
						ok: false,
						status: opts.v1Status,
						json: async () => ({})
					} as unknown as Response
				}
				if (opts.v1Dates === 'fail' || opts.v1Dates === undefined) {
					return { ok: false, status: 404 } as unknown as Response
				}
				const tags = Object.entries(opts.v1Dates).map(
					([name, last_modified]) => ({
						name,
						last_modified,
						manifest_digest: opts.digests[name]
					})
				)
				return {
					ok: true,
					status: 200,
					json: async () => ({ tags })
				} as unknown as Response
			}
			if (url.includes('/tags/list')) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						name: 'ns/repo',
						tags: Object.keys(opts.digests)
					})
				} as unknown as Response
			}
			if (url.includes('/blobs/')) {
				if (opts.blobCreated == null) {
					return { ok: false, status: 404 } as unknown as Response
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ created: opts.blobCreated })
				} as unknown as Response
			}
			if (url.includes('/manifests/')) {
				const requestedTag = url.split('/manifests/')[1]
				const digest = opts.digests[requestedTag]
				if (!digest) {
					return { ok: false, status: 404 } as unknown as Response
				}
				return {
					ok: true,
					status: 200,
					headers: {
						get: (name: string) => {
							if (name.toLowerCase() === 'docker-content-digest') return digest
							if (name.toLowerCase() === 'last-modified')
								return opts.manifestLastModified ?? null
							return null
						}
					},
					json: async () => opts.manifestBody ?? {}
				} as unknown as Response
			}
			return { ok: false, status: 404 } as unknown as Response
		}) as unknown as typeof fetch
	}

	it('manifest sin Last-Modified + API v1 con last_modified => lastUpdated definido', async () => {
		const fetchedUrls: string[] = []
		mockQuayDates({
			digests: { 'v1.0.0': 'sha256:quay111', latest: 'sha256:quay222' },
			v1Dates: {
				'v1.0.0': '2024-06-15T12:00:00Z',
				latest: '2024-07-01T00:00:00Z'
			},
			manifestLastModified: null,
			manifestBody: {},
			fetchedUrls
		})
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:v1.0.0',
			'sha256:local'
		)
		expect(result.latestDigest).toBe('sha256:quay111')
		expect(result.lastUpdated).toBe('2024-06-15T12:00:00Z')
		expect(
			fetchedUrls.some((u) =>
				u.includes('/api/v1/repository/thefrenchghosty/openchamber/tag/')
			)
		).toBe(true)
		expect(fetchedUrls.some((u) => u.includes('onlyActiveTags=true'))).toBe(
			true
		)
	})

	it('duplicados historicos mismo name eligen el digest activo del targetTag', async () => {
		mockQuayDates({
			digests: { latest: 'sha256:active222' },
			v1Entries: [
				{
					name: 'latest',
					manifest_digest: 'sha256:old111',
					last_modified: '2024-06-01T00:00:00Z',
					start_ts: 1717200000
				},
				{
					name: 'latest',
					manifest_digest: 'sha256:active222',
					last_modified: '2024-09-16T10:00:00Z',
					start_ts: 1726480800
				}
			],
			manifestLastModified: null,
			manifestBody: {}
		})
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:latest',
			'sha256:local'
		)
		expect(result.latestDigest).toBe('sha256:active222')
		// El historico 06-01 no contamina: gana el digest activo (push 16/09).
		expect(result.lastUpdated).toBe('2024-09-16T10:00:00Z')
	})

	it('sin fechas en ninguna fuente => lastUpdated undefined (UI oculta como hoy)', async () => {
		mockQuayDates({
			digests: { 'v1.0.0': 'sha256:quay111', latest: 'sha256:quay222' },
			v1Dates: 'fail',
			manifestLastModified: null,
			manifestBody: {},
			blobCreated: null
		})
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:v1.0.0',
			'sha256:local'
		)
		// El check sigue resolviendo digest; solo falta la fecha.
		expect(result.latestDigest).toBe('sha256:quay111')
		expect(result.lastUpdated).toBeUndefined()
	})

	it('v1 400 => lastUpdated undefined aunque exista created en blob (no build-time)', async () => {
		mockQuayDates({
			digests: { 'v1.0.0': 'sha256:quay111', latest: 'sha256:quay222' },
			v1Status: 400,
			manifestLastModified: null,
			manifestBody: { config: { digest: 'sha256:cfg123' } },
			blobCreated: '2023-05-01T08:00:00Z'
		})
		const { checkImageUpdateRaw } = await import('@/lib/registry-updates')
		const result = await checkImageUpdateRaw(
			'quay.io/thefrenchghosty/openchamber:v1.0.0',
			'sha256:local'
		)
		expect(result.latestDigest).toBe('sha256:quay111')
		expect(result.lastUpdated).toBeUndefined()
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
