import { describe, expect, it } from 'vitest'
import type { ContainerData } from '@/types/dashboard'
import { applyOptimisticUpdate, applyVerifiedUpdate } from './optimistic-update'

function makeContainer(
	id: string,
	overrides?: Partial<ContainerData>
): ContainerData {
	return {
		container: {
			Id: id,
			State: 'running',
			Image: 'nginx:1.25',
			ImageID: 'sha256:old',
			Status: 'Up 2 hours',
			Names: ['/web']
		},
		isRunning: true,
		ports: '80/tcp',
		updateStatus: 'available',
		containerName: 'web',
		displayCurrentVersion: '1.25',
		isUpToDate: false,
		...overrides
	}
}

describe('applyOptimisticUpdate', () => {
	it('marks the updated container as up to date on the new version', () => {
		const list = [makeContainer('c1'), makeContainer('c2')]

		const result = applyOptimisticUpdate(list, 'c1', {
			imageName: 'nginx:1.26',
			newVersion: '1.26',
			newContainerId: 'c1',
			newImageId: 'sha256:new'
		})

		expect(result[0]).toMatchObject({
			currentVersion: '1.26',
			displayCurrentVersion: '1.26',
			latestVersion: '1.26',
			isUpToDate: true,
			updateStatus: 'updated',
			container: {
				Id: 'c1',
				Image: 'nginx:1.26',
				ImageID: 'sha256:new'
			}
		})
		// Other containers untouched (and not the same object)
		expect(result[1]).toBe(list[1])
	})

	it('when the container was recreated, keeps the new id and resets status', () => {
		const stopped = makeContainer('old-id', {
			container: {
				Id: 'old-id',
				State: 'exited',
				Image: 'nginx:1.25',
				ImageID: 'sha256:old',
				Status: 'Exited (0) 1 hour ago',
				Names: ['/web']
			}
		})

		const result = applyOptimisticUpdate([stopped], 'old-id', {
			imageName: 'nginx:1.26',
			newVersion: '1.26',
			newContainerId: 'new-id'
		})

		expect(result[0].container).toMatchObject({
			Id: 'new-id',
			State: 'running',
			Status: 'Up 0 seconds',
			// No newImageId provided — keeps the previous one
			ImageID: 'sha256:old'
		})
	})

	it('when the state was already running, preserves the original status text', () => {
		const running = makeContainer('old-id')

		const result = applyOptimisticUpdate([running], 'old-id', {
			imageName: 'nginx:1.26',
			newVersion: '1.26',
			newContainerId: 'new-id'
		})

		expect(result[0].container.Status).toBe('Up 2 hours')
	})
})

describe('applyVerifiedUpdate', () => {
	it('reverts the container to "update available" when the tag moved again', () => {
		const list = [
			makeContainer('c1', {
				latestVersion: '1.26',
				isUpToDate: true,
				updateStatus: 'updated'
			})
		]

		const result = applyVerifiedUpdate(
			list,
			'c1',
			{
				hasUpdate: true,
				latestVersion: '1.27',
				dockerHubUrl: 'https://hub.docker.com/_/nginx',
				policyState: 'NEW_COMPATIBLE_VERSION_AVAILABLE'
			},
			'1.26'
		)

		expect(result[0]).toMatchObject({
			latestVersion: '1.27',
			isUpToDate: false,
			updateStatus: 'available',
			dockerHubUrl: 'https://hub.docker.com/_/nginx',
			policyState: 'NEW_COMPATIBLE_VERSION_AVAILABLE'
		})
	})

	it('falls back to the just-applied version when the registry omits one', () => {
		const list = [makeContainer('c1', { isUpToDate: true })]

		const result = applyVerifiedUpdate(
			list,
			'c1',
			{ hasUpdate: true, latestVersion: undefined },
			'1.26'
		)

		expect(result[0].latestVersion).toBe('1.26')
	})
})
