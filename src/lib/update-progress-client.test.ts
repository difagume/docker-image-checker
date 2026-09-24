import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerData } from '@/types/dashboard'
import {
	ACTIVE_UPDATE_TASKS_URL,
	lookupActiveUpdateTasks,
	resolveTriggerFailureOutcome,
	resolveUpdateContextFromList
} from './update-progress-client'

function makeContainer(overrides: {
	id: string
	image?: string
	containerName?: string
	latestVersion?: string
}): ContainerData {
	return {
		container: {
			Id: overrides.id,
			State: 'running',
			Image: overrides.image ?? 'nginx',
			ImageID: 'sha256:imageid',
			Status: 'Up 2 hours',
			Names: ['nginx']
		},
		isRunning: true,
		ports: '80/tcp',
		updateStatus: 'available',
		containerName: overrides.containerName ?? 'nginx',
		displayCurrentVersion: '1.0.0',
		isUpToDate: false,
		...(overrides.latestVersion !== undefined
			? { latestVersion: overrides.latestVersion }
			: {})
	}
}

describe('resolveTriggerFailureOutcome (failed-trigger decision table)', () => {
	const containerId = 'cont-1'
	const task = {
		taskId: 'task-1',
		phase: 'pulling' as const,
		statusText: 'Pulling image...'
	}

	it('attaches when the answered lookup holds a task for this container, regardless of the marker', () => {
		const lookup = { [containerId]: task }
		expect(resolveTriggerFailureOutcome(true, lookup, containerId)).toBe(
			'attach'
		)
		expect(resolveTriggerFailureOutcome(false, lookup, containerId)).toBe(
			'attach'
		)
	})

	it("does not attach on another container's task", () => {
		const lookup = { 'other-cont': task }
		expect(resolveTriggerFailureOutcome(true, lookup, containerId)).toBe(
			'surface-no-task'
		)
		expect(resolveTriggerFailureOutcome(false, lookup, containerId)).toBe(
			'surface-failure'
		)
	})

	it('reports the failed lookup when the marker matched but the endpoint was unreachable', () => {
		expect(resolveTriggerFailureOutcome(true, null, containerId)).toBe(
			'surface-lookup-failed'
		)
	})

	it('surfaces a genuine failure when the lookup failed and the marker did not match', () => {
		expect(resolveTriggerFailureOutcome(false, null, containerId)).toBe(
			'surface-failure'
		)
	})

	it('surfaces a calm no-task notice only when the server answered with nothing running for this container', () => {
		expect(resolveTriggerFailureOutcome(true, {}, containerId)).toBe(
			'surface-no-task'
		)
		expect(
			resolveTriggerFailureOutcome(true, { 'other-cont': task }, containerId)
		).toBe('surface-no-task')
	})

	it('surfaces a genuine failure when the server answered but neither marker nor task corroborate', () => {
		expect(resolveTriggerFailureOutcome(false, {}, containerId)).toBe(
			'surface-failure'
		)
		expect(
			resolveTriggerFailureOutcome(false, { 'other-cont': task }, containerId)
		).toBe('surface-failure')
	})
})

describe('resolveUpdateContextFromList (terminal-phase context)', () => {
	it('resolves image, version, and name for a container in the list', () => {
		const containers = [
			makeContainer({
				id: 'abc1234567890',
				image: 'nginx',
				containerName: 'web',
				latestVersion: '2.1.0'
			})
		]

		expect(resolveUpdateContextFromList('abc1234567890', containers)).toEqual({
			hasContext: true,
			context: {
				imageName: 'nginx:2.1.0',
				newVersion: '2.1.0',
				containerName: 'web'
			}
		})
	})

	it('keeps the registry host when retagging the image', () => {
		const containers = [
			makeContainer({
				id: 'abc1234567890',
				image: 'ghcr.io/acme/app',
				latestVersion: '1.2.3'
			})
		]

		expect(resolveUpdateContextFromList('abc1234567890', containers)).toEqual({
			hasContext: true,
			context: {
				imageName: 'ghcr.io/acme/app:1.2.3',
				newVersion: '1.2.3',
				containerName: 'nginx'
			}
		})
	})

	it('falls back to the latest tag when there is no usable version', () => {
		const containers = [
			makeContainer({ id: 'c1', latestVersion: 'latest' }),
			makeContainer({ id: 'c2', latestVersion: 'Unknown' }),
			makeContainer({ id: 'c3' })
		]

		for (const id of ['c1', 'c2', 'c3']) {
			const resolved = resolveUpdateContextFromList(id, containers)
			expect(resolved.hasContext).toBe(true)
			expect(resolved.context.newVersion).toBe('latest')
			expect(resolved.context.imageName).toBe('nginx:latest')
		}
	})

	it('returns an explicit empty result when the container is missing', () => {
		const resolved = resolveUpdateContextFromList('0123456789abcdefghij', [
			makeContainer({ id: 'other' })
		])

		expect(resolved).toEqual({
			hasContext: false,
			context: {
				imageName: '',
				newVersion: '',
				containerName: '0123456789ab'
			}
		})
	})
})

describe('lookupActiveUpdateTasks (bounded active-task lookup)', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('resolves the parsed task record on an ok response', async () => {
		const fetchImpl = vi.fn(async (input: string) => {
			expect(input).toBe(ACTIVE_UPDATE_TASKS_URL)
			return new Response(
				JSON.stringify({
					tasks: {
						'cont-1': {
							taskId: 'task-1',
							phase: 'pulling',
							statusText: 'Pulling image...'
						}
					}
				}),
				{ status: 200 }
			)
		})

		expect(await lookupActiveUpdateTasks(fetchImpl)).toEqual({
			'cont-1': {
				taskId: 'task-1',
				phase: 'pulling',
				statusText: 'Pulling image...'
			}
		})
		expect(console.warn).not.toHaveBeenCalled()
	})

	it('resolves an empty record when the response omits tasks', async () => {
		const fetchImpl = async () => new Response('{}', { status: 200 })
		expect(await lookupActiveUpdateTasks(fetchImpl)).toEqual({})
	})

	it('resolves null and warns on a non-OK response', async () => {
		const fetchImpl = async () => new Response('unavailable', { status: 503 })

		expect(await lookupActiveUpdateTasks(fetchImpl)).toBeNull()
		expect(console.warn).toHaveBeenCalled()
	})

	it('resolves null and warns when the request times out', async () => {
		const fetchImpl = (_input: string, init?: RequestInit): Promise<Response> =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					reject(new Error('The operation was aborted'))
				})
			})

		expect(await lookupActiveUpdateTasks(fetchImpl, 5)).toBeNull()
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('aborted'),
			expect.any(Error)
		)
	})

	it('resolves null and warns on a network error', async () => {
		const fetchImpl = async (): Promise<Response> => {
			throw new Error('connection refused')
		}

		expect(await lookupActiveUpdateTasks(fetchImpl)).toBeNull()
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('failed'),
			expect.any(Error)
		)
	})
})
