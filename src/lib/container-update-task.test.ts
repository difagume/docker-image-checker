import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import { progressStore } from '@/lib/update-progress-store'

const mocks = vi.hoisted(() => {
	const newContainer = {
		id: 'newcont1234567890',
		inspect: vi.fn().mockResolvedValue({ Image: 'sha256:newimage' }),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
	const container = {
		inspect: vi.fn().mockResolvedValue({
			State: { Running: true },
			Config: {
				Image: 'nginx:1.0.0',
				Cmd: ['nginx', '-g', 'daemon off;'],
				Env: ['A=1'],
				ExposedPorts: {},
				Labels: {},
				WorkingDir: undefined
			},
			HostConfig: {
				Binds: [],
				PortBindings: {},
				RestartPolicy: { Name: 'no' },
				NetworkMode: 'bridge'
			},
			NetworkSettings: { Networks: {} },
			Name: '/web'
		}),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		start: vi.fn().mockResolvedValue(undefined)
	}
	const modem = {
		followProgress: vi.fn(
			(_stream: unknown, callback: (err: Error | null) => void) =>
				callback(null)
		)
	}
	const docker = {
		getContainer: vi.fn(() => container),
		pull: vi.fn().mockResolvedValue('stream'),
		createContainer: vi.fn().mockResolvedValue(newContainer),
		modem
	}
	const callbacks = {
		clearContainerCallbacks: vi.fn().mockResolvedValue(0)
	}
	return { container, newContainer, modem, docker, callbacks }
})

vi.mock('@/lib/docker', () => ({ default: mocks.docker }))

vi.mock('@/lib/notifications/notification-callbacks', () => mocks.callbacks)

import { runContainerUpdateTask } from './container-update-task'

describe('runContainerUpdateTask (R6, R7, R10, R11)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.docker.pull.mockResolvedValue('stream')
		mocks.docker.createContainer.mockResolvedValue(mocks.newContainer)
		mocks.container.inspect.mockResolvedValue({
			State: { Running: true },
			Config: {
				Image: 'nginx:1.0.0',
				Cmd: ['nginx'],
				Env: ['A=1'],
				ExposedPorts: {},
				Labels: {},
				WorkingDir: undefined
			},
			HostConfig: {
				Binds: [],
				PortBindings: {},
				RestartPolicy: { Name: 'no' },
				NetworkMode: 'bridge'
			},
			NetworkSettings: { Networks: {} },
			Name: '/web'
		})
		mocks.callbacks.clearContainerCallbacks.mockResolvedValue(0)
	})

	it('runs the full pipeline and resolves done with success, revalidates and clears callbacks (R6.1, R11)', async () => {
		const revalidate = vi.fn().mockResolvedValue(undefined)
		const onPhase = vi.fn()

		const handle = await runContainerUpdateTask('cont-1', 'nginx:1.2.3', {
			revalidate,
			onPhase
		})

		const result = await handle.done

		expect(result).toEqual({
			success: true,
			newContainerId: 'newcont12345',
			newImageId: 'sha256:newimage'
		})
		expect(revalidate).toHaveBeenCalledWith(REFRESH_TAGS)
		expect(mocks.callbacks.clearContainerCallbacks).toHaveBeenCalledWith(
			'cont-1'
		)
		expect(onPhase).toHaveBeenCalledWith(
			'pulling',
			expect.objectContaining({ statusText: 'Pulling image...' })
		)
		expect(progressStore.getProgress(handle.taskId)?.phase).toBe('done')
		expect(progressStore.isContainerUpdating('cont-1')).toBe(false)
	})

	it('throws when the container is already being updated (R7.1)', async () => {
		let resolvePull!: (value: unknown) => void
		const pendingPull = new Promise((resolve) => {
			resolvePull = resolve
		})
		mocks.docker.pull.mockReturnValueOnce(pendingPull)

		const first = await runContainerUpdateTask('cont-busy', 'nginx:2.0.0')

		expect(progressStore.isContainerUpdating('cont-busy')).toBe(true)

		await expect(
			runContainerUpdateTask('cont-busy', 'nginx:2.0.0')
		).rejects.toThrow('Container update already in progress')

		// Release the pull so the first task terminates cleanly
		resolvePull('stream')
		await first.done

		expect(progressStore.isContainerUpdating('cont-busy')).toBe(false)
	})

	it('reports errors, does not revalidate, and cleans up the progress entry (R10.1)', async () => {
		mocks.container.inspect.mockRejectedValueOnce(
			new Error('no such container')
		)
		const revalidate = vi.fn()

		const handle = await runContainerUpdateTask('cont-missing', 'nginx:3.0.0', {
			revalidate
		})

		const result = await handle.done

		expect(result.success).toBe(false)
		expect(result.error).toBe('no such container')
		expect(revalidate).not.toHaveBeenCalled()
		expect(mocks.callbacks.clearContainerCallbacks).not.toHaveBeenCalled()
		expect(progressStore.getProgress(handle.taskId)?.phase).toBe('error')
		expect(progressStore.isContainerUpdating('cont-missing')).toBe(false)
	})

	it('unregisters the container even when the revalidator throws (cleanup always)', async () => {
		const revalidate = vi
			.fn()
			.mockRejectedValueOnce(new Error('revalidation exploded'))

		const handle = await runContainerUpdateTask('cont-2', 'nginx:1.2.3', {
			revalidate
		})

		const result = await handle.done

		expect(result.success).toBe(false)
		expect(result.error).toBe('revalidation exploded')
		expect(progressStore.isContainerUpdating('cont-2')).toBe(false)
	})
})
