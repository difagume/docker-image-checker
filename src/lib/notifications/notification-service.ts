import type { ContainerInfo, ImageInfo } from 'dockerode'
import {
	alreadyNotifiedFresh,
	getPreferredLanguage,
	hasBeenNotified,
	loadState,
	markAsNotified
} from '@/lib/app-state'
import { getDictionary, type Locale } from '@/lib/i18n/dictionaries'
import { parseImageReference, resolveLocalDigest } from '@/lib/image-name'
import { getReferenceUrls } from '@/lib/reference-url-manager'
import {
	type CheckImageUpdateResult,
	checkImageUpdateRaw
} from '@/lib/registry-updates'
import type { ContainerUpdate, NotificationMessage } from '@/types/app-state'
import { getEnabledProviders } from './provider-factory'

/**
 * Check for container updates and send notifications.
 *
 * `checkUpdate` lets callers choose between the raw path (default — used by
 * the scheduler, which runs outside the App Router request context where
 * "use cache" would throw E279) and the cached wrappers (used by request-context
 * callers such as the /api/notifications/test route).
 */
export async function checkAndNotify(
	containers: ContainerInfo[],
	images: ImageInfo[],
	checkUpdate: (
		imageName: string,
		localDigest?: string
	) => Promise<CheckImageUpdateResult> = checkImageUpdateRaw
): Promise<void> {
	console.log('▶️ Starting notification check...')

	const providers = getEnabledProviders()

	if (providers.length === 0) {
		console.log('🚫 No notification providers enabled, skipping notifications')
		return
	}

	console.log(
		`🔔 Active notification providers: ${providers.map((p) => p.name).join(', ')}`
	)

	const state = await loadState()
	const ignoredNotificationIds = state.ignoredNotificationIds || []
	const referenceUrls = await getReferenceUrls()
	const updates: ContainerUpdate[] = []

	// Check each container for updates
	for (const container of containers) {
		try {
			const containerName = container.Names?.[0]?.replace('/', '') || 'Unnamed'

			// Skip ignored containers
			if (ignoredNotificationIds.includes(container.Id)) {
				console.log(
					`🔕 Container ${containerName} has notifications disabled, skipping notification`
				)
				continue
			}

			// Find local image details
			const localImage = images.find((img) => img.Id === container.ImageID)
			const localDigest = resolveLocalDigest(localImage)

			// Check for updates (scheduler path uses the raw reader; request-context
			// callers may pass a cached wrapper)
			const updateInfo = await checkUpdate(container.Image, localDigest)

			// Skip if no update available or if it's a local image
			if (!updateInfo.hasUpdate || updateInfo.isLocal) {
				continue
			}

			// Skip if no latest digest (can't track properly)
			if (!updateInfo.latestDigest) {
				continue
			}

			// Extract image name without tag and current tag (registry ports safe)
			const { repository: imageNameOnly, tag: currentTag } =
				parseImageReference(container.Image)

			// Determine current version: prefer updateInfo.currentVersion, fallback to tag
			const currentVersion =
				updateInfo.currentVersion && updateInfo.currentVersion !== 'Unknown'
					? updateInfo.currentVersion
					: currentTag

			const update: ContainerUpdate = {
				dockerContainerId: container.Id,
				fullImageName: `${imageNameOnly}:${updateInfo.latestVersion || 'latest'}`,
				containerName,
				imageName: imageNameOnly, // Only image name, no tag
				imageDigest: localDigest || '',
				currentVersion, // Actual version or tag
				latestVersion: updateInfo.latestVersion || 'latest',
				latestDigest: updateInfo.latestDigest,
				dockerHubUrl: updateInfo.dockerHubUrl,
				lastUpdated: updateInfo.lastUpdated
			}

			// Check if already notified
			if (hasBeenNotified(state, update)) {
				console.log(`⏭️ Update for ${containerName} already notified, skipping`)
				continue
			}

			updates.push(update)
		} catch (error) {
			console.error(
				`❌ Error checking container ${container.Names?.[0]}:`,
				error
			)
		}
	}

	// Send notifications for new updates
	if (updates.length === 0) {
		console.log('📭 No new updates to notify')
		return
	}

	console.log(`📣 Found ${updates.length} new update(s) to notify`)

	// Get preferred language and dictionary
	const language = (await getPreferredLanguage()) as Locale
	const dict = getDictionary(language)
	const t = dict.notifications

	for (const update of updates) {
		const message: NotificationMessage = {
			containerName: update.containerName,
			imageName: update.imageName, // Already without tag
			dockerContainerId: update.dockerContainerId,
			fullImageName: update.fullImageName,
			currentVersion: update.currentVersion, // Already resolved
			latestVersion: update.latestVersion,
			dockerHubUrl: update.dockerHubUrl,
			referenceUrl: referenceUrls[update.imageName]?.referenceUrl,
			lastUpdated: update.lastUpdated,
			translations: {
				title: t.title,
				container: t.container,
				image: t.image,
				current: t.current,
				latest: t.latest,
				updated: t.updated,
				viewReference: t.viewReference,
				viewOnRegistry: t.viewOnRegistry,
				update: t.update,
				updating: t.updating,
				updateStatusSuccess: t.updateStatusSuccess,
				updateStatusError: t.updateStatusError,
				updateStatusAlready: t.updateStatusAlready
			},
			locale: language
		}

		// B-07: decide-and-reserve atomically. A concurrent round may have
		// marked this digest after our round-start snapshot; re-check fresh
		// state and reserve (mark) BEFORE sending so overlapping rounds can
		// never duplicate the same notification. Marking before send also
		// preserves the NOTIF-07 behavior: the entry stays marked even when
		// providers fail.
		if (await alreadyNotifiedFresh(update)) {
			console.log(
				`⏭️ ${update.containerName} was notified by a concurrent check, skipping`
			)
			continue
		}
		await markAsNotified(update)

		// Send to all providers
		const results = await Promise.allSettled(
			providers.map((provider) => provider.send(message))
		)

		// Log results
		results.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				console.log(`✅ Notification sent via ${providers[index].name}`)
			} else {
				console.error(
					`❌ Failed to send via ${providers[index].name}:`,
					result.reason
				)
			}
		})
	}

	console.log('🏁 Notification check completed')
}
