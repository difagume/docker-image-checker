import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const core = vi.hoisted(() => ({
	runContainerUpdateTask: vi.fn(),
	updateContainerImage: vi.fn()
}))

vi.mock('@/lib/container-update-task', () => core)
vi.mock('@/lib/docker', () => ({
	default: { getImage: vi.fn(), getContainer: vi.fn() }
}))
vi.mock('@/lib/registry-updates', () => ({ checkImageUpdate: vi.fn() }))

import { triggerContainerUpdate } from './docker'

describe('triggerContainerUpdate (R6.2 — web flow unchanged)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('awaits the shared core and returns the resolved taskId', async () => {
		core.runContainerUpdateTask.mockImplementation(
			async (_containerId: string, _image: string, opts: unknown) => {
				expect((opts as { revalidate?: unknown }).revalidate).toBeTypeOf(
					'function'
				)
				return {
					taskId: 'task-web-1',
					done: Promise.resolve({ success: true })
				}
			}
		)

		const result = await triggerContainerUpdate('cont-1', 'nginx:1.2.3')

		expect(result.taskId).toBe('task-web-1')
		expect(core.runContainerUpdateTask).toHaveBeenCalledWith(
			'cont-1',
			'nginx:1.2.3',
			expect.objectContaining({ revalidate: expect.any(Function) })
		)
	})

	it('propagates a dedup rejection from the core to the caller', async () => {
		core.runContainerUpdateTask.mockRejectedValue(
			new Error('Container update already in progress')
		)

		await expect(
			triggerContainerUpdate('cont-1', 'nginx:1.2.3')
		).rejects.toThrow('Container update already in progress')
	})
})
