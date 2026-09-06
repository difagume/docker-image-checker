import type { ContainerData } from '@/types/dashboard'

export interface OptimisticUpdateOptions {
	imageName: string
	newVersion: string
	/** Id of the recreated container when the daemon replaced it, else the original id. */
	newContainerId: string
	newImageId?: string
}

/**
 * Applies the immediate post-update card state while verification runs in the
 * background: the container is reported as running the new version and
 * up to date. Mirrors what `container-update-task` produces on the server.
 */
export function applyOptimisticUpdate(
	containers: ContainerData[],
	containerId: string,
	{ imageName, newVersion, newContainerId, newImageId }: OptimisticUpdateOptions
): ContainerData[] {
	return containers.map((c) => {
		if (c.container.Id !== containerId) {
			return c
		}

		return {
			...c,
			displayCurrentVersion: newVersion,
			currentVersion: newVersion,
			latestVersion: newVersion,
			isUpToDate: true,
			updateStatus: 'updated' as const,
			container: {
				...c.container,
				Id: newContainerId,
				Image: imageName,
				// A recreated container always starts running; preserve the original
				// status text when the state was already "running".
				...(newContainerId !== containerId
					? {
							State: 'running' as const,
							Status:
								c.container.State === 'running'
									? c.container.Status
									: 'Up 0 seconds'
						}
					: {}),
				ImageID: newImageId || c.container.ImageID
			}
		}
	})
}

export interface VerifiedUpdateInfo {
	hasUpdate: boolean
	latestVersion?: string
	dockerHubUrl?: string
	policyState?: ContainerData['policyState']
}

/**
 * Reconciles the card with the result of a post-update registry check. When
 * the same tag moved again (or the update landed on an older digest), the card
 * goes back to "update available". `fallbackVersion` keeps the just-applied
 * version when the registry response omits one.
 */
export function applyVerifiedUpdate(
	containers: ContainerData[],
	containerId: string,
	updateInfo: VerifiedUpdateInfo,
	fallbackVersion: string
): ContainerData[] {
	return containers.map((c) => {
		if (c.container.Id !== containerId) {
			return c
		}

		return {
			...c,
			latestVersion: updateInfo.latestVersion || fallbackVersion,
			isUpToDate: false,
			updateStatus: 'available' as const,
			dockerHubUrl: updateInfo.dockerHubUrl,
			policyState: updateInfo.policyState
		}
	})
}
