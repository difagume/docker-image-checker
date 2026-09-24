export type UpdatePhase =
	| 'pulling'
	| 'stopping'
	| 'recreating'
	| 'starting'
	| 'verifying'
	| 'done'
	| 'error'

/**
 * Single source of truth for "a task in this phase is finished": `done` and
 * `error` end a task, every other phase keeps it live. Used by the store's
 * read models, the dashboard cards, and the reconnection logic in the hook.
 */
export function isTerminalUpdatePhase(phase: UpdatePhase): boolean {
	return phase === 'done' || phase === 'error'
}

export interface ProgressState {
	phase: UpdatePhase
	statusText: string
	currentLayer?: number
	totalLayers?: number
	error?: string
	result?: {
		newContainerId?: string
		newImageId?: string
	}
	updatedAt: number
}

/** Non-terminal task snapshot keyed by container id (see `listActive`). */
export interface ActiveUpdateTask {
	taskId: string
	phase: UpdatePhase
	statusText: string
}

class ProgressStoreImpl {
	private tasks = new Map<string, ProgressState>()
	private containerTasks = new Map<string, string>() // containerId → taskId
	private cleanupInterval: ReturnType<typeof setInterval> | null = null
	private readonly TTL = 5 * 60 * 1000 // 5 minutes

	constructor() {
		if (typeof setInterval !== 'undefined') {
			this.cleanupInterval = setInterval(() => this.sweep(), 60 * 1000)
		}
	}

	private sweep(): void {
		const now = Date.now()
		for (const [taskId, state] of this.tasks) {
			if (now - state.updatedAt > this.TTL) {
				this.tasks.delete(taskId)
			}
		}
		// Clean up stale container-task mappings
		for (const [containerId, taskId] of this.containerTasks) {
			if (!this.tasks.has(taskId)) {
				this.containerTasks.delete(containerId)
			}
		}
	}

	isContainerUpdating(containerId: string): boolean {
		const taskId = this.containerTasks.get(containerId)
		if (!taskId) return false
		const state = this.tasks.get(taskId)
		if (!state) return false
		// Only blocking if the task is in a non-terminal phase
		return state.phase !== 'done' && state.phase !== 'error'
	}

	registerContainer(containerId: string, taskId: string): void {
		this.containerTasks.set(containerId, taskId)
	}

	/**
	 * Non-terminal tasks keyed by container id — the read model behind
	 * `GET /api/update-progress/active`, used by clients to re-attach
	 * progress streams after a reload. Mirrors the terminal-phase exclusion
	 * of `isContainerUpdating`; mappings to already-swept tasks are skipped.
	 */
	listActive(): Record<string, ActiveUpdateTask> {
		const active: Record<string, ActiveUpdateTask> = {}
		for (const [containerId, taskId] of this.containerTasks) {
			const state = this.tasks.get(taskId)
			if (!state) continue
			if (isTerminalUpdatePhase(state.phase)) continue
			active[containerId] = {
				taskId,
				phase: state.phase,
				statusText: state.statusText
			}
		}
		return active
	}

	unregisterContainer(containerId: string): void {
		this.containerTasks.delete(containerId)
	}

	createTask(taskId: string): void {
		this.tasks.set(taskId, {
			phase: 'pulling',
			statusText: 'Starting...',
			updatedAt: Date.now()
		})
	}

	updatePhase(
		taskId: string,
		phase: UpdatePhase,
		statusText: string,
		layerProgress?: { currentLayer?: number; totalLayers?: number }
	): void {
		const existing = this.tasks.get(taskId)
		if (!existing) return
		this.tasks.set(taskId, {
			...existing,
			phase,
			statusText,
			...(layerProgress?.currentLayer !== undefined
				? { currentLayer: layerProgress.currentLayer }
				: {}),
			...(layerProgress?.totalLayers !== undefined
				? { totalLayers: layerProgress.totalLayers }
				: {}),
			updatedAt: Date.now()
		})
	}

	getProgress(taskId: string): ProgressState | undefined {
		return this.tasks.get(taskId)
	}

	setResult(
		taskId: string,
		result?: {
			newContainerId?: string
			newImageId?: string
		}
	): void {
		const existing = this.tasks.get(taskId)
		if (!existing) return
		this.tasks.set(taskId, {
			...existing,
			phase: 'done',
			statusText: 'Update complete',
			result,
			updatedAt: Date.now()
		})
	}

	setError(taskId: string, error: string): void {
		const existing = this.tasks.get(taskId)
		if (!existing) return
		this.tasks.set(taskId, {
			...existing,
			phase: 'error',
			statusText: 'Update failed',
			error,
			updatedAt: Date.now()
		})
	}

	cleanup(taskId: string): void {
		this.tasks.delete(taskId)
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
		}
	}
}

const GLOBAL_KEY = '__docker_progress_store__'
const g = globalThis as unknown as Record<string, ProgressStoreImpl | undefined>

function getGlobalStore(): ProgressStoreImpl {
	const existing = g[GLOBAL_KEY]
	if (existing) return existing
	const store = new ProgressStoreImpl()
	g[GLOBAL_KEY] = store
	return store
}

export const progressStore: ProgressStoreImpl = getGlobalStore()
