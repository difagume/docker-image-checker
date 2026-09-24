import { describe, expect, it } from 'vitest'
import { progressStore } from './update-progress-store'

// `progressStore` is a module-level singleton. Every assertion below is
// key-scoped: it checks ids this file registers (or one it explicitly never
// registers), so it holds regardless of the execution order of these tests.
describe('progressStore.listActive (reconnection source)', () => {
	// All container ids this suite ever registers in the store.
	const OWN_CONTAINER_IDS = [
		'cont-active',
		'cont-done',
		'cont-error',
		'cont-clean',
		'cont-orphan'
	]

	it('returns undefined for a container id that was never registered', () => {
		expect(progressStore.listActive()['cont-never-registered']).toBeUndefined()
	})

	it('reports only container ids registered by this suite', () => {
		const unexpected = Object.keys(progressStore.listActive()).filter(
			(id) => !OWN_CONTAINER_IDS.includes(id)
		)
		expect(unexpected).toEqual([])
	})

	it('includes a registered non-terminal task keyed by container id', () => {
		progressStore.createTask('task-active')
		progressStore.registerContainer('cont-active', 'task-active')

		expect(progressStore.listActive()['cont-active']).toEqual({
			taskId: 'task-active',
			phase: 'pulling',
			statusText: 'Starting...'
		})
	})

	it('excludes tasks in the done phase', () => {
		progressStore.createTask('task-done')
		progressStore.registerContainer('cont-done', 'task-done')
		progressStore.setResult('task-done', { newContainerId: 'new123' })

		expect(progressStore.listActive()).not.toHaveProperty('cont-done')
	})

	it('excludes tasks in the error phase', () => {
		progressStore.createTask('task-error')
		progressStore.registerContainer('cont-error', 'task-error')
		progressStore.setError('task-error', 'boom')

		expect(progressStore.listActive()).not.toHaveProperty('cont-error')
	})

	it('excludes containers unregistered by task cleanup', () => {
		progressStore.createTask('task-clean')
		progressStore.registerContainer('cont-clean', 'task-clean')
		progressStore.unregisterContainer('cont-clean')

		expect(progressStore.listActive()).not.toHaveProperty('cont-clean')
	})

	it('skips container mappings whose task no longer exists', () => {
		progressStore.registerContainer('cont-orphan', 'task-gone')
		expect(progressStore.listActive()).not.toHaveProperty('cont-orphan')
		progressStore.unregisterContainer('cont-orphan')
	})
})
