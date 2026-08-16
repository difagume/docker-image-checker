'use server'

import { updateTag } from 'next/cache'
import { requireAuthIfEnabled } from '@/lib/auth-guard'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import {
	runContainerUpdateTask,
	updateContainerImage
} from '@/lib/container-update-task'
import docker from '@/lib/docker'
import type { PolicyState } from '@/lib/policies/types'
import { checkImageUpdate } from '@/lib/registry-updates'

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
		// Get the new digest from the updated image
		const image = docker.getImage(imageName)
		const imageInfo = await image.inspect()
		const localDigest = imageInfo.Id

		// Check for updates with the new image (cached registry scope; the new
		// digest is a cache miss, so this queries fresh)
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
