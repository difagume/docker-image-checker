'use server'

import { updateTag } from 'next/cache'
import { requireAuthIfEnabled } from '@/lib/auth-guard'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import {
	runContainerUpdateTask,
	updateContainerImage
} from '@/lib/container-update-task'
import { listImagesRaw } from '@/lib/docker-inventory'
import { resolveLocalDigest } from '@/lib/image-name'
import type { PolicyState } from '@/lib/policies/types'
import { checkImageUpdateRaw } from '@/lib/registry-updates'

export type { OnPhaseCallback } from '@/lib/container-update-task'
export { updateContainerImage }

/**
 * Start an image update from the web dashboard. Thin wrapper over the shared
 * request-agnostic core: injects an `updateTag` revalidator (read-your-writes)
 * and keeps the fire-and-forget + `{ taskId }` contract unchanged for
 * `use-container-updates.ts`. Progress keeps flowing through `progressStore`
 * (wired inside the core) so the `/api/update-progress` SSE route works as
 * before.
 */
export async function triggerContainerUpdate(
	containerId: string,
	newImageName: string
): Promise<{ taskId: string }> {
	await requireAuthIfEnabled()
	const { taskId } = await runContainerUpdateTask(containerId, newImageName, {
		revalidate: async () => {
			for (const tag of REFRESH_TAGS) {
				updateTag(tag)
			}
		}
	})

	return { taskId }
}

export async function verifyContainerUpdate(imageName: string): Promise<{
	hasUpdate: boolean
	latestVersion?: string
	dockerHubUrl?: string
	policyState?: PolicyState
	localDigest?: string
}> {
	await requireAuthIfEnabled()
	try {
		// Resolve local digest consistently with getContainerUpdateStates:
		// list images and find by RepoTags containing the exact imageName,
		// then derive digest from RepoDigests via resolveLocalDigest.
		// This avoids using docker.getImage(imageName).inspect().Id which
		// returns the image config ID, not the registry content digest,
		// causing false-positive "update available" after a successful pull.
		const images = await listImagesRaw()
		const localImage = images.find((img) => img.RepoTags?.includes(imageName))
		const localDigest = resolveLocalDigest(localImage)

		// Bypass the cached registry scope (900s revalidate) to ensure
		// read-your-writes: after a pull the new digest must be checked
		// fresh, otherwise the stale cached result would still report
		// hasUpdate=true for up to 15 minutes.
		const updateInfo = await checkImageUpdateRaw(imageName, localDigest)

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
