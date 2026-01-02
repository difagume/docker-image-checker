'use server'

import type { ContainerInfo, ImageInfo } from 'dockerode'
import docker from '@/lib/docker'
import { evaluatePolicies } from '@/lib/policies/engine'
import type {
	ImageContext,
	PolicyResult,
	RemoteTag
} from '@/lib/policies/types'

export async function getContainers(): Promise<ContainerInfo[]> {
	try {
		const containers = await docker.listContainers({ all: true })
		return JSON.parse(JSON.stringify(containers))
	} catch (error) {
		console.error('Failed to list containers:', error)
		return []
	}
}

export async function getImages(): Promise<ImageInfo[]> {
	try {
		const images = await docker.listImages()
		return JSON.parse(JSON.stringify(images))
	} catch (error) {
		console.error('Failed to list images:', error)
		return []
	}
}

export async function checkImageUpdate(
	imageName: string,
	localDigest?: string
): Promise<{
	hasUpdate: boolean
	latestDigest?: string
	lastUpdated?: string
	currentVersion?: string
	latestVersion?: string
	dockerHubUrl?: string
	isLocal?: boolean
	policyResult?: PolicyResult
}> {
	// 1. Detect GHCR images
	if (imageName.startsWith('ghcr.io/')) {
		return checkGhcrUpdate(imageName, localDigest)
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
		const tagsUrl = `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=100`
		const tagsResponse = await fetch(tagsUrl, { next: { revalidate: 3600 } })

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

		// Find the actual remote version we are comparing against or recommending
		const targetTag =
			policyResult.details?.latestCompatible ||
			policyResult.details?.majorAvailable ||
			tag

		const targetRemote =
			remoteTags.find((r) => r.tag === targetTag) || remoteTags[0]

		return {
			hasUpdate,
			latestDigest: targetRemote.digest,
			lastUpdated: targetRemote.publishedAt,
			currentVersion: tag,
			latestVersion: targetTag,
			dockerHubUrl: `https://hub.docker.com/r/${repo}/tags`,
			isLocal: false,
			policyResult
		}
	} catch (error) {
		console.error('Failed to check image update:', error)
		return { hasUpdate: false, isLocal: false }
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

async function checkGhcrUpdate(
	fullImageName: string,
	localDigest?: string
): Promise<{
	hasUpdate: boolean
	latestDigest?: string
	lastUpdated?: string
	currentVersion?: string
	latestVersion?: string
	dockerHubUrl?: string
	isLocal?: boolean
	policyResult?: PolicyResult
}> {
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
			`https://api.github.com/users/${owner}/packages/container/${packageName}/versions?per_page=100`,
			`https://api.github.com/orgs/${owner}/packages/container/${packageName}/versions?per_page=100`
		]

		let data: GhcrPackageVersion[] = []
		let success = false

		for (const url of endpoints) {
			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28'
				},
				next: { revalidate: 3600 }
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
			return { hasUpdate: false, isLocal: false }
		}

		// Map to RemoteTag[]
		const remoteTags: RemoteTag[] = []
		for (const v of data) {
			const digest = v.name // The 'name' field contains the digest like sha256:...
			const publishedAt = v.updated_at
			const tags = v.metadata?.container?.tags || []

			for (const t of tags) {
				remoteTags.push({ tag: t, digest, publishedAt })
			}

			// If no tags, track the digest itself as a reference
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

		return {
			hasUpdate,
			latestDigest: targetRemote.digest,
			lastUpdated: targetRemote.publishedAt,
			currentVersion: tag,
			latestVersion: targetTag,
			dockerHubUrl: `https://github.com/${owner}/${repo}/pkgs/container/${packageName}`,
			isLocal: false,
			policyResult
		}
	} catch (error) {
		console.error(
			`Failed to check GHCR image update for ${fullImageName}:`,
			error
		)
		return { hasUpdate: false, isLocal: false }
	}
}

export async function checkDockerConnection(): Promise<boolean> {
	try {
		await docker.ping()
		return true
	} catch (error) {
		console.error('Docker connection failed:', error)
		return false
	}
}
