import {
	checkDockerConnection,
	getContainers,
	getImages
} from '@/actions/docker'
import { ContainerDashboard } from '@/components/container-dashboard'
import { DashboardProvider } from '@/contexts/dashboard-context'
import { getDashboardSettings } from '@/lib/app-state'
import { getCacheKey, loadContainersCache } from '@/lib/cache/containers'
import { getDockerConnectionInfo } from '@/lib/docker-connection'
import type { Locale } from '@/lib/i18n/dictionaries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import type { FilterStatus } from '@/types/app-state'

export async function DashboardContent({ locale }: { locale: Locale }) {
	console.log('[Dashboard] Starting to load container data...')
	const startTime = Date.now()

	const dict = getDictionary(locale)
	console.log('[Dashboard] Loading containers from Docker...')
	const [containers, images, cache, settings, dockerConnected] =
		await Promise.all([
			getContainers(),
			getImages(),
			loadContainersCache(),
			getDashboardSettings(),
			checkDockerConnection()
		])
	console.log(
		`[Dashboard] Found ${containers.length} containers and ${images.length} images`
	)

	console.log('[Dashboard] Initializing container update tracking...')
	const processedContainers = containers.map((container) => {
		const isRunning = container.State === 'running'
		const ports = (container.Ports || [])
			.filter((p) => p.PublicPort > 0)
			.map((p) => `${p.PublicPort}:${p.PrivatePort}`)
			.join(', ')

		const imageTag = container.Image.split(':')[1] || 'latest'
		const containerName = container.Names?.[0]?.replace('/', '') || 'Unnamed'

		const localImage = images.find((img) => img.Id === container.ImageID)
		let localDigest = localImage?.RepoDigests?.[0]?.split('@')[1]
		if (!localDigest && container.ImageID) {
			localDigest = container.ImageID
		}

		// Try to hydrate from cache using the current localDigest as key.
		// If the digest matches what was cached, we have a valid (non-stale) entry.
		const cacheKey = localDigest
			? getCacheKey(container.Image, localDigest)
			: null
		const cached = cacheKey ? cache[cacheKey] : undefined

		if (cached) {
			// Use cached data — no "checking" flash on load
			return {
				container,
				isRunning,
				ports,
				containerName,
				localDigest,
				// Cached fields
				updateStatus: cached.updateStatus,
				displayCurrentVersion: cached.displayCurrentVersion,
				currentVersion: cached.currentVersion,
				latestVersion: cached.latestVersion,
				lastUpdated: cached.lastUpdated,
				dockerHubUrl: cached.dockerHubUrl,
				isUpToDate: cached.isUpToDate,
				policyState: cached.policyState,
				// Mark as stale so the client refreshes it in the background
				isStale: true
			}
		}

		// No cache hit — will be freshly checked on the client
		return {
			container,
			isRunning,
			ports,
			updateStatus: 'checking' as const,
			containerName,
			displayCurrentVersion: imageTag,
			isUpToDate: true,
			localDigest,
			isStale: false
		}
	})

	const elapsed = Date.now() - startTime
	console.log(
		`[Dashboard] Finished loading initial container data in ${elapsed}ms`
	)

	return (
		<DashboardProvider
			notificationsEnabled={process.env.NOTIFICATIONS_ENABLED === 'true'}
		>
			<ContainerDashboard
				processedContainers={processedContainers}
				dict={dict}
				locale={locale}
				connectionInfo={getDockerConnectionInfo()}
				initialActiveFilters={settings.activeFilters as FilterStatus[]}
				initialShowHiddenMode={settings.showHiddenMode}
				dockerConnected={dockerConnected}
			/>

			{containers.length === 0 && (
				<div className='text-center text-muted-foreground'>
					{dict.dashboard.noContainers}
				</div>
			)}
		</DashboardProvider>
	)
}
