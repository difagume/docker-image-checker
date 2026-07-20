'use server'

import type { ContainerInfo, ImageInfo } from 'dockerode'
import { revalidatePath } from 'next/cache'
import docker from '@/lib/docker'
import { evaluatePolicies } from '@/lib/policies/engine'
import type {
	ImageContext,
	PolicyResult,
	PolicyState,
	RemoteTag
} from '@/lib/policies/types'

const FETCH_TIMEOUT = 8000

function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeout = FETCH_TIMEOUT
): Promise<Response> {
	const startTime = Temporal.Now.instant().epochMilliseconds
	console.log(`[Docker API] Starting fetch: ${url}`)

	let timeoutId: NodeJS.Timeout | null = null

	const fetchPromise = fetch(url, options).then((response) => {
		if (timeoutId) clearTimeout(timeoutId)
		const elapsed = Temporal.Now.instant().epochMilliseconds - startTime
		console.log(`[Docker API] Success: ${url} (${elapsed}ms)`)
		return response
	})

	const timeoutPromise = new Promise<Response>((_, reject) => {
		timeoutId = setTimeout(() => {
			const elapsed = Temporal.Now.instant().epochMilliseconds - startTime
			console.warn(`[Docker API] Timeout: ${url} after ${elapsed}ms`)
			reject(new Error(`Timeout after ${timeout}ms`))
		}, timeout)
	})

	return Promise.race([fetchPromise, timeoutPromise])
}

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
	ghcrError?: 'invalid_token'
	ghcrImageName?: string
}> {
	// 1. Detect GHCR images
	if (imageName.startsWith('ghcr.io/')) {
		const result = await checkGhcrUpdate(imageName, localDigest)
		return result
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
		const tagsResponse = await fetchWithTimeout(tagsUrl, {
			next: { revalidate: 3600 }
		})

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
	ghcrError?: 'invalid_token'
	ghcrImageName?: string
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

export async function checkDockerConnection(): Promise<boolean> {
	try {
		await docker.ping()
		return true
	} catch (error) {
		console.error('Docker connection failed:', error)
		return false
	}
}

export async function updateContainerImage(
	containerId: string,
	newImageName: string
): Promise<{
	success: boolean
	error?: string
	newContainerId?: string
	newImageId?: string
}> {
	try {
		const container = docker.getContainer(containerId)
		const containerInfo = await container.inspect()

		const wasRunning = containerInfo.State.Running
		const config = containerInfo.Config
		const hostConfig = containerInfo.HostConfig
		const networkingConfig = containerInfo.NetworkSettings
		const name = containerInfo.Name.replace(/^\//, '')

		console.log(
			`[Image Update] Starting update for container ${containerId}: ${config.Image} -> ${newImageName}`
		)

		if (wasRunning) {
			console.log(
				`[Image Update] Container is running, will stop -> recreate -> start`
			)
		}

		const pullStream = await docker.pull(newImageName)
		await new Promise<void>((resolve, reject) => {
			docker.modem.followProgress(pullStream, (err: Error | null) => {
				if (err) reject(err)
				else resolve()
			})
		})

		console.log(`[Image Update] Image ${newImageName} pulled successfully`)

		if (wasRunning) {
			console.log(`[Image Update] Stopping container ${containerId}...`)
			await container.stop()

			console.log(`[Image Update] Removing old container ${containerId}...`)
			await container.remove()

			const exposedPorts: Record<string, object> = {}
			if (config.ExposedPorts) {
				for (const port of Object.keys(config.ExposedPorts)) {
					exposedPorts[port] = {}
				}
			}

			const binds: string[] = hostConfig.Binds || []

			const restartPolicy: { Name: string; MaximumRetryCount?: number } = {
				Name: hostConfig.RestartPolicy?.Name || 'no'
			}
			if (hostConfig.RestartPolicy?.MaximumRetryCount !== undefined) {
				restartPolicy.MaximumRetryCount =
					hostConfig.RestartPolicy.MaximumRetryCount
			}

			const portBindings: Record<
				string,
				Array<{ HostIp: string; HostPort: string }> | undefined
			> = {}
			if (hostConfig.PortBindings) {
				for (const [containerPort, hostPorts] of Object.entries(
					hostConfig.PortBindings
				)) {
					portBindings[containerPort] = hostPorts as Array<{
						HostIp: string
						HostPort: string
					}>
				}
			}

			const networks: Record<string, object> = {}
			if (networkingConfig.Networks) {
				for (const networkName of Object.keys(networkingConfig.Networks)) {
					networks[networkName] = {}
				}
			}

			const env: string[] = []
			if (config.Env) {
				for (const envVar of config.Env) {
					if (!envVar.startsWith('PORT=') && !envVar.startsWith('HOST_PORT=')) {
						env.push(envVar)
					}
				}
			}

			console.log(
				`[Image Update] Creating new container with image ${newImageName}...`
			)
			const newContainer = await docker.createContainer({
				name,
				Image: newImageName,
				Cmd: config.Cmd,
				Env: env.length > 0 ? env : undefined,
				WorkingDir: config.WorkingDir || undefined,
				Labels: config.Labels,
				ExposedPorts:
					Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
				HostConfig: {
					Binds: binds.length > 0 ? binds : undefined,
					PortBindings:
						Object.keys(portBindings).length > 0 ? portBindings : undefined,
					RestartPolicy: restartPolicy,
					NetworkMode: hostConfig.NetworkMode || undefined
				},
				NetworkingConfig:
					Object.keys(networks).length > 0
						? { EndpointsConfig: networks }
						: undefined
			})

			console.log(`[Image Update] Starting new container ${newContainer.id}...`)
			await newContainer.start()

			// Inspect the new container to get fresh ImageID
			const newContainerInfo = await newContainer.inspect()

			console.log(
				`[Image Update] Successfully updated container ${containerId} -> ${newContainer.id}`
			)

			return {
				success: true,
				newContainerId: newContainer.id.substring(0, 12),
				newImageId: newContainerInfo.Image
			}
		}

		console.log(`[Image Update] Container was stopped, image updated locally`)
		return { success: true }
	} catch (error) {
		console.error(
			`[Image Update] Failed to update container ${containerId}:`,
			error
		)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		}
	}
}

export async function checkImagesUpdatesBatch(
	items: Array<{
		containerId: string
		imageName: string
		localDigest?: string
	}>
): Promise<
	Array<{
		containerId: string
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
		error?: string
	}>
> {
	return Promise.all(
		items.map(async (item) => {
			try {
				const result = await checkImageUpdate(item.imageName, item.localDigest)
				return { containerId: item.containerId, ...result }
			} catch (error) {
				return {
					containerId: item.containerId,
					hasUpdate: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}
			}
		})
	)
}

export async function refreshDashboard(): Promise<void> {
	'use server'
	revalidatePath('/')
}

export async function verifyContainerUpdate(imageName: string): Promise<{
	hasUpdate: boolean
	latestVersion?: string
	dockerHubUrl?: string
	policyState?: PolicyState
	localDigest?: string
}> {
	'use server'

	try {
		// Get the new digest from the updated image
		const image = docker.getImage(imageName)
		const imageInfo = await image.inspect()
		const localDigest = imageInfo.Id

		// Check for updates with the new image
		const updateInfo = await checkImageUpdate(imageName, localDigest)

		return {
			hasUpdate: updateInfo.hasUpdate,
			latestVersion: updateInfo.latestVersion,
			dockerHubUrl: updateInfo.dockerHubUrl,
			policyState: updateInfo.policyResult?.state,
			localDigest
		}
	} catch (error) {
		console.error(`[Docker] Failed to verify update for ${imageName}:`, error)
		return { hasUpdate: false }
	}
}
