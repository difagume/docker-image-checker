import { ContainerDashboard } from '@/components/container-dashboard'
import { DashboardProvider } from '@/contexts/dashboard-context'
import type { ContainerData } from '@/hooks/use-container-updates'
import {
	getDashboardSettings,
	getHiddenContainerIds,
	getIgnoredNotificationContainerIds
} from '@/lib/app-state'
import { getDockerConnectionInfo } from '@/lib/docker-connection'
import { getDockerConnected } from '@/lib/docker-inventory'
import type { Locale } from '@/lib/i18n/dictionaries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getReferenceUrls } from '@/lib/reference-url-manager'
import {
	type ContainerUpdateState,
	getContainerUpdateStates
} from '@/lib/registry-updates'
import type { FilterStatus, SortBy, SortDir } from '@/types/app-state'

const DEFAULT_ACTIVE_FILTERS: FilterStatus[] = [
	'updated',
	'available',
	'unknown'
]

export async function DashboardContent({ locale }: { locale: Locale }) {
	console.log('[Dashboard] Starting to load container data...')
	// performance.now() is a monotonic telemetry timer; Date.now() would block
	// prerendering (blocking-prerender-current-time) and only logs here.
	const startTime = performance.now()

	const dict = getDictionary(locale)
	console.log('[Dashboard] Loading containers from Docker...')

	// Docker-down graceful degrade: the cached readers throw when the daemon is
	// unreachable (the cache never stores error states). Catch here and render
	// the friendly "no containers" copy instead of a raw ENOENT crash.
	let updateStates: ContainerUpdateState[] = []
	let settings: Awaited<ReturnType<typeof getDashboardSettings>> | undefined
	let dockerConnected = false
	let hiddenIds: string[] = []
	let ignoredIds: string[] = []
	let referenceUrls: Awaited<ReturnType<typeof getReferenceUrls>> = {}
	try {
		;[
			updateStates,
			settings,
			dockerConnected,
			hiddenIds,
			ignoredIds,
			referenceUrls
		] = await Promise.all([
			getContainerUpdateStates(),
			getDashboardSettings(),
			getDockerConnected(),
			getHiddenContainerIds(),
			getIgnoredNotificationContainerIds(),
			getReferenceUrls()
		])
	} catch (error) {
		console.error(
			'[Dashboard] Docker connection failed, degrading to empty state:',
			error
		)
	}

	// Per-container data is fully derived server-side by getContainerUpdateStates
	// (registry:checks cache scope) — no client round-trip, no 'checking' flash.
	const processedContainers: ContainerData[] = updateStates.map((state) => ({
		container: state.container,
		isRunning: state.isRunning,
		ports: state.ports,
		containerName: state.containerName,
		localDigest: state.localDigest,
		updateStatus: state.updateStatus,
		displayCurrentVersion: state.displayCurrentVersion,
		currentVersion: state.currentVersion,
		latestVersion: state.latestVersion,
		lastUpdated: state.lastUpdated,
		dockerHubUrl: state.dockerHubUrl,
		isUpToDate: state.isUpToDate,
		policyState: state.policyState,
		ghcrError: state.ghcrError
	}))

	const elapsed = performance.now() - startTime
	console.log(
		`[Dashboard] Resolved update states for ${updateStates.length} containers in ${elapsed}ms`
	)

	return (
		<DashboardProvider
			notificationsEnabled={process.env.NOTIFICATIONS_ENABLED === 'true'}
			initialHiddenIds={hiddenIds}
			initialIgnoredIds={ignoredIds}
			initialReferenceUrls={referenceUrls}
		>
			<ContainerDashboard
				processedContainers={processedContainers}
				dict={dict}
				locale={locale}
				connectionInfo={getDockerConnectionInfo()}
				initialActiveFilters={
					(settings?.activeFilters ?? DEFAULT_ACTIVE_FILTERS) as FilterStatus[]
				}
				initialShowHiddenMode={settings?.showHiddenMode ?? false}
				initialSortBy={(settings?.sortBy ?? 'name') as SortBy}
				initialSortDir={(settings?.sortDir ?? 'asc') as SortDir}
				dockerConnected={dockerConnected}
			/>

			{updateStates.length === 0 && (
				<div className='text-center text-muted-foreground'>
					{dict.dashboard.noContainers}
				</div>
			)}
		</DashboardProvider>
	)
}
