export type UpdatePhase =
	| 'pulling'
	| 'stopping'
	| 'recreating'
	| 'starting'
	| 'verifying'
	| 'done'
	| 'error'

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
		result?: { newContainerId?: string; newImageId?: string }
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
