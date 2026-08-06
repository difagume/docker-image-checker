import { ContainerDashboard } from '@/components/container-dashboard'
import { DashboardProvider } from '@/contexts/dashboard-context'
import { getDashboardSettings } from '@/lib/app-state'
import { getDockerConnectionInfo } from '@/lib/docker-connection'
import {
	getContainers,
	getDockerConnected,
	getImages
} from '@/lib/docker-inventory'
import type { Locale } from '@/lib/i18n/dictionaries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getContainerUpdateStates } from '@/lib/registry-updates'
import type { FilterStatus } from '@/types/app-state'

export async function DashboardContent({ locale }: { locale: Locale }) {
	console.log('[Dashboard] Starting to load container data...')
	// performance.now() is a monotonic telemetry timer; Date.now() would block
	// prerendering (blocking-prerender-current-time) and only logs here.
	const startTime = performance.now()

	const dict = getDictionary(locale)
	console.log('[Dashboard] Loading containers from Docker...')
	const [containers, images, updateStates, settings, dockerConnected] =
		await Promise.all([
			getContainers(),
			getImages(),
			getContainerUpdateStates(),
			getDashboardSettings(),
			getDockerConnected()
		])

	console.log(
		`[Dashboard] Found ${containers.length} containers and ${images.length} images`
	)

	console.log('[Dashboard] Resolving container update state...')
	const statesByContainerId = new Map(
		updateStates.map((state) => [state.containerId, state])
	)

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

		// Update status resolved server-side by getContainerUpdateStates
		// (registry:checks cache scope) — no client round-trip, no 'checking' flash.
		const state = statesByContainerId.get(container.Id)

		return {
			container,
			isRunning,
			ports,
			containerName,
			localDigest,
			updateStatus: state?.updateStatus ?? 'unknown',
			displayCurrentVersion: state?.displayCurrentVersion ?? imageTag,
			currentVersion: state?.currentVersion,
			latestVersion: state?.latestVersion,
			lastUpdated: state?.lastUpdated,
			dockerHubUrl: state?.dockerHubUrl,
			isUpToDate: state?.isUpToDate ?? true,
			policyState: state?.policyState
		}
	})

	const elapsed = performance.now() - startTime
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
