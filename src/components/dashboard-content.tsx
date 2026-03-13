'use server'

import { checkImageUpdate, getContainers, getImages } from '@/actions/docker'
import { ContainerDashboard } from '@/components/container-dashboard'
import { GhcrTokenToast } from '@/components/ghcr-token-toast'
import { getDictionary } from '@/lib/i18n/dictionaries'
import type { Locale } from '@/lib/i18n/dictionaries'

export async function DashboardContent({ locale }: { locale: Locale }) {
	console.log('[Dashboard] Starting to load container data...')
	const startTime = Date.now()

	const dict = getDictionary(locale)
	console.log('[Dashboard] Loading containers from Docker...')
	const containers = await getContainers()
	const images = await getImages()
	console.log(`[Dashboard] Found ${containers.length} containers and ${images.length} images`)

	console.log('[Dashboard] Checking for image updates...')
	const processedContainers = await Promise.all(
		containers.map(async (container) => {
			const isRunning = container.State === 'running'
			const ports = (container.Ports || [])
				.map((p) => `${p.PrivatePort}:${p.PublicPort}`)
				.join(', ')

			const localImage = images.find((img) => img.Id === container.ImageID)

			let localDigest = localImage?.RepoDigests?.[0]?.split('@')[1]
			if (!localDigest && container.ImageID) {
				localDigest = container.ImageID
			}

			const {
				hasUpdate,
				latestDigest,
				lastUpdated,
				currentVersion,
				latestVersion,
				dockerHubUrl,
				isLocal,
				policyResult,
				ghcrError,
				ghcrImageName
			} = await checkImageUpdate(container.Image, localDigest)

			const imageTag = container.Image.split(':')[1] || 'latest'
			const displayCurentVersion =
				currentVersion && currentVersion !== 'Unknown'
					? currentVersion
					: imageTag

			let updateStatus: 'updated' | 'available' | 'unknown' | 'local' =
				'unknown'
			const isUpToDate = !hasUpdate

			if (isLocal) {
				updateStatus = 'local'
			} else if (latestDigest) {
				updateStatus = hasUpdate ? 'available' : 'updated'
			}

			const containerName = container.Names?.[0]?.replace('/', '') || 'Unnamed'

			return {
				container,
				isRunning,
				ports,
				updateStatus,
				containerName,
				currentVersion,
				displayCurentVersion,
				latestVersion,
				lastUpdated,
				dockerHubUrl,
				isUpToDate,
				policyState: policyResult?.state,
				ghcrError,
				ghcrImageName
			}
		})
	)

	const elapsed = Date.now() - startTime
	console.log(`[Dashboard] Finished loading all container data in ${elapsed}ms`)

	const stats = {
		updated: processedContainers.filter((c) => c.updateStatus === 'updated')
			.length,
		available: processedContainers.filter((c) => c.updateStatus === 'available')
			.length,
		unknown: processedContainers.filter(
			(c) => c.updateStatus === 'unknown' || c.updateStatus === 'local'
		).length
	}

	const ghcrTokenErrors = processedContainers
		.filter((c) => c.ghcrError === 'invalid_token' && c.ghcrImageName)
		.map((c) => c.ghcrImageName as string)

	return (
		<>
			{ghcrTokenErrors.length > 0 && (
				<GhcrTokenToast imageNames={ghcrTokenErrors} dict={dict} />
			)}

			<ContainerDashboard
				processedContainers={processedContainers}
				stats={stats}
				dict={dict}
				locale={locale}
				notificationsEnabled={
					process.env.NOTIFICATIONS_ENABLED === 'true'
				}
			/>

			{containers.length === 0 && (
				<div className='text-center py-20 text-neutral-500'>
					{dict.dashboard.noContainers}
				</div>
			)}
		</>
	)
}
