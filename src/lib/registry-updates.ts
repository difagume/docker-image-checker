import type { ContainerInfo } from 'dockerode'
import { cacheLife, cacheTag } from 'next/cache'
import {
	CACHE_TAGS,
	REGISTRY_EXPIRE_SECONDS,
	REGISTRY_REVALIDATE_SECONDS
} from '@/lib/cache-tags'
import { getContainers, getImages } from '@/lib/docker-inventory'
import { parseImageReference } from '@/lib/image-name'
import { evaluatePolicies } from '@/lib/policies/engine'
import type {
	ImageContext,
	PolicyResult,
	PolicyState,
	RemoteTag
} from '@/lib/policies/types'
import type { FilterStatus } from '@/types/app-state'

const FETCH_TIMEOUT = 8000

export interface CheckImageUpdateResult {
	hasUpdate: boolean
	latestDigest?: string
	lastUpdated?: string
	currentVersion?: string
	latestVersion?: string
	dockerHubUrl?: string
	isLocal?: boolean
	policyResult?: PolicyResult
	ghcrError?: 'invalid_token'
	ghcrImageName?: string
}

export interface ContainerUpdateState {
	containerId: string
	container: ContainerInfo
	isRunning: boolean
	ports: string
	containerName: string
	localDigest?: string
	hasUpdate: boolean
	updateStatus: FilterStatus | 'local'
	currentVersion?: string
	displayCurrentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
	policyState?: PolicyState
	ghcrError?: 'invalid_token'
	ghcrImageName?: string
}

/**
 * Fetch with a real abort on timeout so a hung registry request cannot hold
 * the socket open past the deadline. No time APIs on purpose beyond the
 * timer: this helper runs inside "use cache" scopes, where
 * `Date.now()`/`Temporal.Now` would block prerendering
 * (blocking-prerender-current-time).
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeout = FETCH_TIMEOUT
): Promise<Response> {
	const controller = new AbortController()
	const timeoutId = setTimeout(
		() => controller.abort(new Error(`Timeout after ${timeout}ms`)),
		timeout
	)

	try {
		return await fetch(url, { ...options, signal: controller.signal })
	} finally {
		clearTimeout(timeoutId)
	}
}

interface GhcrPackageVersion {
	id: number
	name: string
	updated_at: string
	metadata: {
		package_type: string
		container: {
			tags: string[]
		}
	}
}

// ── Raw checks (no cache — used by the scheduler/notification path, which
// ── runs outside of the App Router request context where "use cache"
// ── would throw E279) ─────────────────────────────────────────────────

export async function checkImageUpdateRaw(
	imageName: string,
	localDigest?: string
): Promise<CheckImageUpdateResult> {
	// 1. Detect GHCR images
	if (imageName.startsWith('ghcr.io/')) {
		return checkGhcrUpdateRaw(imageName, localDigest)
	}

	// 2. Handle known registries proxying Docker Hub
	if (imageName.startsWith('lscr.io/')) {
		imageName = imageName.replace('lscr.io/', '')
	}
	if (imageName.startsWith('docker.hyperdx.io/')) {
		imageName = imageName.replace('docker.hyperdx.io/', '')
	}

	try {
		const parts = imageName.split(':')
		let repo = parts[0]
		const tag = parts[1] || 'latest'
		const originalRepo = repo

		if (!repo.includes('/')) {
			repo = `library/${repo}`
		}

		// Single fetch for tags
		const tagsUrl = `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=70`
		const tagsResponse = await fetchWithTimeout(tagsUrl)

		if (!tagsResponse.ok) {
			if (tagsResponse.status === 404) {
				// Detect if it's likely a local image (no slash in original name suggests docker-compose naming)
				const isLocal = !originalRepo.includes('/')
				return { hasUpdate: false, isLocal }
			}
			throw new Error(`Docker Hub API error: ${tagsResponse.statusText}`)
		}

		const tagsData = await tagsResponse.json()
		const hubResults =
			(tagsData.results as Array<{
				name: string
				digest: string
				last_updated: string
			}>) || []

		if (hubResults.length === 0) return { hasUpdate: false }

		// Map to ImageContext
		const remoteTags: RemoteTag[] = hubResults.map((r) => ({
			tag: r.name,
			digest: r.digest,
			publishedAt: r.last_updated
		}))

		const context: ImageContext = {
			imageName,
			currentTag: tag,
			currentDigest: localDigest || '',
			remoteTags
		}

		const policyResult = evaluatePolicies(context)

		// Map back to result structure
		const hasUpdate =
			policyResult.state === 'CONTENT_UPDATED' ||
			policyResult.state === 'NEW_COMPATIBLE_VERSION_AVAILABLE' ||
			policyResult.state === 'NEW_MAJOR_VERSION_AVAILABLE'

		const targetTag =
			policyResult.details?.latestCompatible ||
			policyResult.details?.majorAvailable ||
			tag

		const targetRemote =
			remoteTags.find((r) => r.tag === targetTag) || remoteTags[0]

		const result = {
			hasUpdate,
			latestDigest: targetRemote.digest,
			lastUpdated: targetRemote.publishedAt,
			currentVersion: tag,
			latestVersion: targetTag,
			dockerHubUrl: `https://hub.docker.com/r/${repo}/tags`,
			isLocal: false,
			policyResult
		}

		return result
	} catch (error) {
		console.error('Failed to check image update:', error)
		return { hasUpdate: false, isLocal: false }
	}
}

export async function checkGhcrUpdateRaw(
	fullImageName: string,
	localDigest?: string
): Promise<CheckImageUpdateResult> {
	try {
		const nameWithTag = fullImageName.replace('ghcr.io/', '')
		const [imagePath, tag = 'latest'] = nameWithTag.split(':')
		const parts = imagePath.split('/')

		if (parts.length < 2) {
			return { hasUpdate: false, isLocal: true }
		}

		const owner = parts[0]
		const repo = parts.slice(1).join('/')
		const packageName = parts[parts.length - 1]
		const token = process.env.GITHUB_GHCR_TOKEN

		if (!token) {
			console.warn(
				`GITHUB_GHCR_TOKEN not found for ${fullImageName}. GHCR update checks require a token.`
			)
			return { hasUpdate: false, isLocal: false }
		}

		const endpoints = [
			`https://api.github.com/users/${owner}/packages/container/${packageName}/versions?per_page=70`,
			`https://api.github.com/orgs/${owner}/packages/container/${packageName}/versions?per_page=70`
		]

		let data: GhcrPackageVersion[] = []
		let success = false

		for (const url of endpoints) {
			const response = await fetchWithTimeout(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28'
				}
			})

			if (response.ok) {
				data = (await response.json()) as GhcrPackageVersion[]
				success = true
				break
			}
		}

		if (!success || data.length === 0) {
			console.error(
				`GHCR API failed or returned no data for ${fullImageName}. Check your token permissions and package visibility.`
			)
			return {
				hasUpdate: false,
				isLocal: false,
				ghcrError: 'invalid_token',
				ghcrImageName: fullImageName
			}
		}

		const remoteTags: RemoteTag[] = []
		for (const v of data) {
			const digest = v.name
			const publishedAt = v.updated_at
			const tags = v.metadata?.container?.tags || []

			for (const t of tags) {
				remoteTags.push({ tag: t, digest, publishedAt })
			}

			if (tags.length === 0) {
				remoteTags.push({ tag: digest, digest, publishedAt })
			}
		}

		const context: ImageContext = {
			imageName: fullImageName,
			currentTag: tag,
			currentDigest: localDigest || '',
			remoteTags
		}

		const policyResult = evaluatePolicies(context)

		const hasUpdate =
			policyResult.state === 'CONTENT_UPDATED' ||
			policyResult.state === 'NEW_COMPATIBLE_VERSION_AVAILABLE' ||
			policyResult.state === 'NEW_MAJOR_VERSION_AVAILABLE'

		const targetTag =
			policyResult.details?.latestCompatible ||
			policyResult.details?.majorAvailable ||
			tag

		const targetRemote =
			remoteTags.find((r) => r.tag === targetTag) || remoteTags[0]

		const ghcrResult = {
			hasUpdate,
			latestDigest: targetRemote.digest,
			lastUpdated: targetRemote.publishedAt,
			currentVersion: tag,
			latestVersion: targetTag,
			dockerHubUrl: `https://github.com/${owner}/${repo}/pkgs/container/${packageName}`,
			isLocal: false,
			policyResult
		}

		return ghcrResult
	} catch (error) {
		console.error(
			`Failed to check GHCR image update for ${fullImageName}:`,
			error
		)
		return { hasUpdate: false, isLocal: false }
	}
}

// ── Cached checks (Cache Components — dashboard + server actions) ──────

/**
 * Checks whether a container image has an update available on its registry.
 * Cached ~15min (revalidate 900s, expire 1h) under the `registry:checks` tag;
 * the cache key includes `localDigest`, so after a pull the verify (new
 * digest) is a cache miss and queries fresh.
 */
export async function checkImageUpdate(
	imageName: string,
	localDigest?: string
): Promise<CheckImageUpdateResult> {
	'use cache'
	cacheLife({
		revalidate: REGISTRY_REVALIDATE_SECONDS,
		expire: REGISTRY_EXPIRE_SECONDS
	})
	cacheTag(CACHE_TAGS.registry)
	return checkImageUpdateRaw(imageName, localDigest)
}

/**
 * GHCR-specific check. Cached like `checkImageUpdate` under `registry:checks`.
 */
export async function checkGhcrUpdate(
	fullImageName: string,
	localDigest?: string
): Promise<CheckImageUpdateResult> {
	'use cache'
	cacheLife({
		revalidate: REGISTRY_REVALIDATE_SECONDS,
		expire: REGISTRY_EXPIRE_SECONDS
	})
	cacheTag(CACHE_TAGS.registry)
	return checkGhcrUpdateRaw(fullImageName, localDigest)
}

/**
 * Resolves the update state for every container in one cached scope. Runs the
 * registry checks server-side so the first paint already has resolved statuses
 * (cache hit) or waits on the Suspense skeleton (cache miss). Nested
 * `getContainers()`/`getImages()` scopes are allowed because this outer scope
 * declares an explicit cacheLife.
 */
export async function getContainerUpdateStates(): Promise<
	ContainerUpdateState[]
> {
	'use cache'
	cacheLife({
		revalidate: REGISTRY_REVALIDATE_SECONDS,
		expire: REGISTRY_EXPIRE_SECONDS
	})
	cacheTag(CACHE_TAGS.registry)

	const [containers, images] = await Promise.all([getContainers(), getImages()])

	const states = await Promise.all(
		containers.map(async (container) => {
			const imageTag = parseImageReference(container.Image).tag
			const isRunning = container.State === 'running'
			const ports = (container.Ports || [])
				.filter((p) => p.PublicPort > 0)
				.map((p) => `${p.PublicPort}:${p.PrivatePort}`)
				.join(', ')
			const containerName = container.Names?.[0]?.replace('/', '') || 'Unnamed'

			const localImage = images.find((img) => img.Id === container.ImageID)
			let localDigest = localImage?.RepoDigests?.[0]?.split('@')[1]
			if (!localDigest && container.ImageID) {
				localDigest = container.ImageID
			}

			const result = await checkImageUpdate(container.Image, localDigest)

			const displayCurrentVersion =
				result.currentVersion && result.currentVersion !== 'Unknown'
					? result.currentVersion
					: imageTag

			let updateStatus: FilterStatus | 'local' = 'unknown'
			if (result.isLocal) {
				updateStatus = 'local'
			} else if (result.latestDigest) {
				updateStatus = result.hasUpdate ? 'available' : 'updated'
			}

			return {
				containerId: container.Id,
				container,
				isRunning,
				ports,
				containerName,
				localDigest,
				hasUpdate: result.hasUpdate,
				updateStatus,
				currentVersion: result.currentVersion,
				displayCurrentVersion,
				latestVersion: result.latestVersion,
				lastUpdated: result.lastUpdated,
				dockerHubUrl: result.dockerHubUrl,
				isUpToDate: !result.hasUpdate,
				policyState: result.policyResult?.state,
				ghcrError: result.ghcrError,
				ghcrImageName: result.ghcrImageName
			} satisfies ContainerUpdateState
		})
	)

	return states
}
