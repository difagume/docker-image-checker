'use server'

import type { ContainerInfo, ImageInfo } from 'dockerode'
import docker from '@/lib/docker'

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
		const tagsUrl = `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=30`
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
		const results =
			(tagsData.results as Array<{
				name: string
				digest: string
				last_updated: string
			}>) || []

		if (results.length === 0) return { hasUpdate: false }

		// Helper to find the best semantic version tag for a given digest
		const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(-(.*))?$/
		const parseSemver = (name: string) => {
			const match = name.match(semverRegex)
			if (!match) return null
			return {
				major: parseInt(match[1], 10),
				minor: parseInt(match[2], 10),
				patch: parseInt(match[3], 10),
				suffix: match[5] || '',
				full: name
			}
		}

		const findBestVersionTag = (digestToMatch: string) => {
			const matches = results.filter(
				(r) =>
					r.digest === digestToMatch &&
					r.name !== 'latest' &&
					!r.name.includes('sha-')
			)
			if (matches.length === 0) return undefined

			return matches.sort((a, b) => {
				const aInfo = parseSemver(a.name)
				const bInfo = parseSemver(b.name)

				if (aInfo && !bInfo) return -1
				if (!aInfo && bInfo) return 1

				if (aInfo && bInfo) {
					if (bInfo.major !== aInfo.major) return bInfo.major - aInfo.major
					if (bInfo.minor !== aInfo.minor) return bInfo.minor - aInfo.minor
					if (bInfo.patch !== aInfo.patch) return bInfo.patch - aInfo.patch
				}

				return b.name.localeCompare(a.name, undefined, { numeric: true })
			})[0]?.name
		}

		const findAbsoluteLatestVersion = () => {
			const candidates = results
				.map((r) => ({ ...r, info: parseSemver(r.name) }))
				.filter((r) => r.info !== null) as Array<{
				name: string
				digest: string
				last_updated: string
				info: NonNullable<ReturnType<typeof parseSemver>>
			}>

			if (candidates.length === 0) return null

			return candidates.sort((a, b) => {
				if (b.info.major !== a.info.major) return b.info.major - a.info.major
				if (b.info.minor !== a.info.minor) return b.info.minor - a.info.minor
				if (b.info.patch !== a.info.patch) return b.info.patch - a.info.patch

				// Stable (no suffix) > any suffix
				if (!b.info.suffix && a.info.suffix) return 1
				if (b.info.suffix && !a.info.suffix) return -1

				return b.info.suffix.localeCompare(a.info.suffix)
			})[0]
		}

		// 1. Identify current 'tag' info
		const trackedTagInfo = results.find((r) => r.name === tag)
		const tagDigest = trackedTagInfo?.digest || results[0].digest

		// 2. Resolve current version
		// Show the tag name. If it's generic (no digits), append the discovered version in parentheses.
		let currentVersion = tag
		const hasDigits = /\d/.test(tag)
		if (!hasDigits && localDigest) {
			const discovered = findBestVersionTag(localDigest)
			if (discovered && discovered !== tag) {
				currentVersion = `${tag} (${discovered})`
			}
		}

		// 3. Resolve latest version
		const absoluteLatest = findAbsoluteLatestVersion()
		const latestVersionTag = absoluteLatest?.name || tag
		const remoteDigest = absoluteLatest?.digest || tagDigest
		const lastUpdated =
			absoluteLatest?.last_updated ||
			trackedTagInfo?.last_updated ||
			results[0].last_updated

		// Determine if there's an update (newer digest for same tag OR newer semver found)
		let hasUpdate = false
		if (localDigest) {
			// Newer digest for current tag
			if (localDigest !== tagDigest) hasUpdate = true

			// OR higher semver exists
			if (absoluteLatest?.info) {
				const currentInfo = parseSemver(currentVersion) || parseSemver(tag)
				if (currentInfo) {
					if (absoluteLatest.info.major > currentInfo.major) hasUpdate = true
					else if (
						absoluteLatest.info.major === currentInfo.major &&
						absoluteLatest.info.minor > currentInfo.minor
					)
						hasUpdate = true
					else if (
						absoluteLatest.info.major === currentInfo.major &&
						absoluteLatest.info.minor === currentInfo.minor &&
						absoluteLatest.info.patch > currentInfo.patch
					)
						hasUpdate = true
				}
			}
		}

		return {
			hasUpdate,
			latestDigest: remoteDigest,
			lastUpdated,
			currentVersion,
			latestVersion: latestVersionTag,
			dockerHubUrl: `https://hub.docker.com/r/${repo}/tags`,
			isLocal: false
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
}> {
	try {
		// Example: ghcr.io/owner/repo:tag
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
			console.warn('GITHUB_GHCR_TOKEN not found, falling back to scraping')
			return checkGhcrUpdateScraping(fullImageName, localDigest)
		}

		// Try both user and org endpoints
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
			console.warn(
				'GHCR API failed or returned no data, falling back to scraping'
			)
			return checkGhcrUpdateScraping(fullImageName, localDigest)
		}

		// Find the version matching the current tag
		const currentTagVersion = data.find((v) =>
			v.metadata?.container?.tags?.includes(tag)
		)

		// Latest should be the first one in the list (usually) or the one tagged 'latest'
		const latestVersionObj =
			data.find((v) => v.metadata?.container?.tags?.includes('latest')) ||
			data[0]

		const remoteDigest = latestVersionObj.name // The 'name' field contains the digest like sha256:...
		const lastUpdated = latestVersionObj.updated_at

		// Extract version string (first tag that looks like a version)
		const getBestTag = (v: GhcrPackageVersion) => {
			const tags = v.metadata?.container?.tags || []
			return (
				tags.find((t: string) => /^[vV]?\d+/.test(t)) || tags[0] || 'Unknown'
			)
		}

		const latestVersion = getBestTag(latestVersionObj)
		const currentVersionStr = currentTagVersion
			? getBestTag(currentTagVersion)
			: tag

		const hasUpdate =
			localDigest && remoteDigest ? localDigest !== remoteDigest : false

		return {
			hasUpdate,
			latestDigest: remoteDigest,
			lastUpdated,
			currentVersion: currentVersionStr,
			latestVersion,
			dockerHubUrl: `https://github.com/${owner}/${repo}/pkgs/container/${packageName}`,
			isLocal: false
		}
	} catch (error) {
		console.error('Failed to check GHCR image update with API:', error)
		return checkGhcrUpdateScraping(fullImageName, localDigest)
	}
}

async function checkGhcrUpdateScraping(
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
}> {
	try {
		// Example: ghcr.io/nicotsx/zerobyte:latest
		const nameWithTag = fullImageName.replace('ghcr.io/', '')
		const [imagePath, tag = 'latest'] = nameWithTag.split(':')
		const parts = imagePath.split('/')

		if (parts.length < 2) {
			return { hasUpdate: false, isLocal: true }
		}

		const owner = parts[0]
		const repo = parts.slice(1).join('/')

		// URL structured as mentioned by the user
		const packageUrl = `https://github.com/${owner}/${repo}/pkgs/container/${parts[parts.length - 1]}`

		const response = await fetch(packageUrl, { next: { revalidate: 3600 } })
		if (!response.ok) {
			console.error(`GHCR Scrape error: ${response.status} for ${packageUrl}`)
			return { hasUpdate: false }
		}

		const html = await response.text()

		// Extract tags using regex from "Recent tagged image versions" section
		// The user pointed out the structure. We look for tags in the HTML.
		const recentSection = html.split('Recent tagged image versions')[1]
		if (!recentSection) {
			return { hasUpdate: false }
		}

		// Look for tags in links like: ?tag=v0.20
		const tagRegex = /\?tag=([^"'>]+)/g
		const foundTags: string[] = []
		let match: RegExpExecArray | null
		// biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
		while ((match = tagRegex.exec(recentSection)) !== null) {
			if (!foundTags.includes(match[1])) {
				foundTags.push(match[1])
			}
		}

		if (foundTags.length === 0) {
			return { hasUpdate: false }
		}

		// Latest tag is usually first or named 'latest'
		const latestTag = foundTags.includes('latest')
			? 'latest'
			: foundTags.includes('main')
				? 'main'
				: foundTags[0]

		// For GHCR scraping, we don't easily get the digest for ALL tags without more requests,
		// but we can compare the tag if the user is using a specific version tag.
		// If they use 'latest', we assume an update is available if 'latest' was recently published (we don't have digest here easily)
		// HOWEVER, the user specifically wants to control verification.

		// Let's try to extract the digest for the first item if possible
		const digestMatch = recentSection.match(/sha256:[a-f0-9]{64}/)
		const remoteDigest = digestMatch ? digestMatch[0] : undefined

		const latestVersion =
			foundTags.find(
				(t) => t !== 'latest' && t !== 'main' && /^[vV]?\d+/.test(t)
			) || latestTag

		const hasUpdate =
			localDigest && remoteDigest ? localDigest !== remoteDigest : false

		return {
			hasUpdate,
			latestDigest: remoteDigest,
			currentVersion: tag,
			latestVersion,
			dockerHubUrl: packageUrl, // Using the GH package page as the URL
			isLocal: false
		}
	} catch (error) {
		console.error('Failed to check GHCR image update:', error)
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
