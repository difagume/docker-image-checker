import type {
	ContainerCreateOptions,
	ContainerInspectInfo,
	Container as DockerodeContainer
} from 'dockerode'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import docker from '@/lib/docker'
import { clearContainerCallbacks } from '@/lib/notifications/notification-callbacks'
import type { UpdatePhase } from '@/lib/update-progress-store'
import { progressStore } from '@/lib/update-progress-store'

export type UpdateRevalidator = (
	tags: readonly string[]
) => Promise<void> | void

export type OnPhaseCallback = (
	phase: UpdatePhase,
	data?: {
		statusText?: string
		layerProgress?: { currentLayer?: number; totalLayers?: number }
	}
) => void

export interface UpdateTaskResult {
	success: boolean
	error?: string
	newContainerId?: string
	newImageId?: string
}

export interface UpdateTaskHandle {
	taskId: string
	done: Promise<UpdateTaskResult>
}

/**
 * Normalized create options rebuilt from inspect data so the recreated
 * container keeps its config (env, ports, binds, networks, restart policy).
 * Used for both the new-image recreation and the rollback to the original
 * image. `PORT=`/`HOST_PORT=` env vars are dropped because port mappings are
 * re-specified through PortBindings and stale values would conflict with a
 * changed image.
 */
function buildCreateOptions(
	containerInfo: ContainerInspectInfo,
	imageName: string
): ContainerCreateOptions {
	const { Config: config, HostConfig: hostConfig } = containerInfo
	const networkingConfig = containerInfo.NetworkSettings
	const name = containerInfo.Name.replace(/^\//, '')

	const exposedPorts: Record<string, object> = {}
	if (config.ExposedPorts) {
		for (const port of Object.keys(config.ExposedPorts)) {
			exposedPorts[port] = {}
		}
	}

	const binds: string[] = hostConfig.Binds || []

	const restartPolicy: { Name: string; MaximumRetryCount?: number } = {
		Name: hostConfig.RestartPolicy?.Name || 'no'
	}
	if (hostConfig.RestartPolicy?.MaximumRetryCount !== undefined) {
		restartPolicy.MaximumRetryCount = hostConfig.RestartPolicy.MaximumRetryCount
	}

	const portBindings: Record<
		string,
		Array<{ HostIp: string; HostPort: string }> | undefined
	> = {}
	if (hostConfig.PortBindings) {
		for (const [containerPort, hostPorts] of Object.entries(
			hostConfig.PortBindings
		)) {
			portBindings[containerPort] = hostPorts as Array<{
				HostIp: string
				HostPort: string
			}>
		}
	}

	const networks: Record<string, object> = {}
	if (networkingConfig.Networks) {
		for (const networkName of Object.keys(networkingConfig.Networks)) {
			networks[networkName] = {}
		}
	}

	const env: string[] = []
	if (config.Env) {
		for (const envVar of config.Env) {
			if (!envVar.startsWith('PORT=') && !envVar.startsWith('HOST_PORT=')) {
				env.push(envVar)
			}
		}
	}

	return {
		name,
		Image: imageName,
		Cmd: config.Cmd,
		Env: env.length > 0 ? env : undefined,
		WorkingDir: config.WorkingDir || undefined,
		Labels: config.Labels,
		ExposedPorts:
			Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
		HostConfig: {
			Binds: binds.length > 0 ? binds : undefined,
			PortBindings:
				Object.keys(portBindings).length > 0 ? portBindings : undefined,
			RestartPolicy: restartPolicy,
			NetworkMode: hostConfig.NetworkMode || undefined
		},
		NetworkingConfig:
			Object.keys(networks).length > 0
				? { EndpointsConfig: networks }
				: undefined
	}
}

/**
 * Best-effort rollback: after the original container was removed, recreate it
 * with its original image and config so a failed create/start does not leave
 * the service destroyed. Failures are logged, never thrown — the original
 * update error is the one that matters.
 */
async function rollbackContainer(
	containerInfo: ContainerInspectInfo,
	wasRunning: boolean
): Promise<void> {
	const name = containerInfo.Name.replace(/^\//, '')
	try {
		console.log(`[Image Update] Rolling back container ${name}...`)
		const restored = await docker.createContainer(
			buildCreateOptions(containerInfo, containerInfo.Config.Image)
		)
		if (wasRunning) {
			await restored.start()
		}
		console.log(`[Image Update] Rollback of ${name} succeeded`)
	} catch (rollbackError) {
		console.error(
			`[Image Update] Rollback of ${name} failed, container left removed:`,
			rollbackError
		)
	}
}

/**
 * The actual Docker update pipeline. Moves a container from its current image
 * to `newImageName`, preserving config (env, ports, binds, networks, restart
 * policy). Shared verbatim between the web action and the Telegram polling
 * path so both flows behave identically (R6). If recreation or start fails
 * after the original container was removed, attempts a rollback to the
 * original image.
 */
async function doUpdateContainerImage(
	containerId: string,
	newImageName: string,
	onPhase?: OnPhaseCallback
): Promise<UpdateTaskResult> {
	const container = docker.getContainer(containerId)
	let containerInfo: ContainerInspectInfo | null = null
	let wasRunning = false
	let originalRemoved = false
	let newContainer: DockerodeContainer | null = null

	try {
		containerInfo = await container.inspect()
		wasRunning = containerInfo.State.Running

		console.log(
			`[Image Update] Starting update for container ${containerId}: ${containerInfo.Config.Image} -> ${newImageName}`
		)

		if (wasRunning) {
			console.log(
				`[Image Update] Container is running, will stop -> recreate -> start`
			)
		}

		// Phase: pulling
		onPhase?.('pulling', { statusText: 'Pulling image...' })

		const pullStream = await docker.pull(newImageName)
		await new Promise<void>((resolve, reject) => {
			docker.modem.followProgress(
				pullStream,
				(err: Error | null) => {
					if (err) reject(err)
					else resolve()
				},
				(progress: unknown) => {
					if (!Array.isArray(progress)) return
					const totalLayers = progress.length
					const completedLayers = progress.filter(
						(p: unknown) =>
							typeof p === 'object' &&
							p !== null &&
							'status' in p &&
							typeof (p as { status: string }).status === 'string' &&
							((p as { status: string }).status === 'Pull complete' ||
								(p as { status: string }).status.includes('complete'))
					).length
					onPhase?.('pulling', {
						statusText: `Pulling image... ${completedLayers}/${totalLayers}`,
						layerProgress: {
							currentLayer: completedLayers,
							totalLayers
						}
					})
				}
			)
		})

		console.log(`[Image Update] Image ${newImageName} pulled successfully`)

		if (wasRunning) {
			// Phase: stopping
			onPhase?.('stopping', { statusText: 'Stopping container...' })
			console.log(`[Image Update] Stopping container ${containerId}...`)
			await container.stop()
		}

		console.log(`[Image Update] Removing old container ${containerId}...`)
		await container.remove()
		originalRemoved = true

		// Phase: recreating
		onPhase?.('recreating', { statusText: 'Recreating container...' })

		console.log(
			`[Image Update] Creating new container with image ${newImageName}...`
		)
		newContainer = await docker.createContainer(
			buildCreateOptions(containerInfo, newImageName)
		)

		if (wasRunning) {
			// Phase: starting
			onPhase?.('starting', { statusText: 'Starting container...' })
			console.log(`[Image Update] Starting new container ${newContainer.id}...`)
			await newContainer.start()
		}

		// Phase: verifying
		onPhase?.('verifying', { statusText: 'Verifying update...' })

		// Inspect the new container to get fresh ImageID
		const newContainerInspectInfo = await newContainer.inspect()

		console.log(
			`[Image Update] Successfully updated container ${containerId} -> ${newContainer.id}`
		)

		return {
			success: true,
			newContainerId: newContainer.id.substring(0, 12),
			newImageId: newContainerInspectInfo.Image
		}
	} catch (error) {
		console.error(
			`[Image Update] Failed to update container ${containerId}:`,
			error
		)

		if (originalRemoved && containerInfo) {
			// The original container is gone; drop any half-created replacement
			// so the original name is free again, then restore the original.
			if (newContainer) {
				try {
					await newContainer.remove({ force: true })
				} catch (removeError) {
					console.error(
						`[Image Update] Failed to remove half-created replacement:`,
						removeError
					)
				}
			}
			await rollbackContainer(containerInfo, wasRunning)
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		}
	}
}

/**
 * Thin wrapper around the raw pipeline for callers that want the update result
 * without the progress/task wiring (kept as a re-export-compatible entry point).
 */
export async function updateContainerImage(
	containerId: string,
	newImageName: string
): Promise<UpdateTaskResult> {
	return doUpdateContainerImage(containerId, newImageName)
}

/**
 * Request-agnostic shared update core. Runs the same pipeline as the web
 * dashboard (phases, dedup, config preservation) from any runtime:
 *
 * - Dedups per container via `progressStore.isContainerUpdating` (R7) and
 *   throws when an update is already in flight.
 * - Registers the task in `progressStore` so the dashboard SSE route can
 *   stream progress, and unregisters on completion (cleanup always).
 * - On success: reports the result, calls the injected `revalidate` hook
 *   (web: `updateTag`; Telegram: loopback tunnel), then purges any stale
 *   inline-button callbacks for the container (R11).
 * - On failure: records the error in `progressStore`.
 *
 * `handle.done` resolves with the final `UpdateTaskResult` at the terminal
 * phase so the Telegram poller can edit its message without polling.
 */
export async function runContainerUpdateTask(
	containerId: string,
	newImageName: string,
	opts: { revalidate?: UpdateRevalidator; onPhase?: OnPhaseCallback } = {}
): Promise<UpdateTaskHandle> {
	if (progressStore.isContainerUpdating(containerId)) {
		throw new Error('Container update already in progress')
	}

	const taskId = crypto.randomUUID()
	progressStore.createTask(taskId)
	progressStore.registerContainer(containerId, taskId)

	const cleanup = () => {
		progressStore.unregisterContainer(containerId)
	}

	const run = async (): Promise<UpdateTaskResult> => {
		try {
			const result = await doUpdateContainerImage(
				containerId,
				newImageName,
				(phase, data) => {
					progressStore.updatePhase(
						taskId,
						phase,
						data?.statusText || '',
						data?.layerProgress
					)
					opts.onPhase?.(phase, data)
				}
			)

			if (result.success) {
				progressStore.setResult(taskId, {
					newContainerId: result.newContainerId,
					newImageId: result.newImageId
				})

				// After a successful update the daemon already has the new
				// digest; invalidate the cached readers so they re-scan
				// instead of serving stale container/image/registry data
				// (web: read-your-writes via updateTag; Telegram: tunnel).
				await opts.revalidate?.(REFRESH_TAGS)

				// Purge stale inline buttons so a tap on an old button for
				// this container cannot re-trigger a pull (R11).
				try {
					await clearContainerCallbacks(containerId)
				} catch (err) {
					console.error(
						`[container-update-task] Failed to clear callbacks for ${containerId}:`,
						err
					)
				}
			} else {
				progressStore.setError(taskId, result.error || 'Update failed')
			}

			cleanup()
			return result
		} catch (err) {
			progressStore.setError(
				taskId,
				err instanceof Error ? err.message : 'Update failed'
			)
			cleanup()
			return {
				success: false,
				error: err instanceof Error ? err.message : 'Update failed'
			}
		}
	}

	// Fire-and-forget: the update runs in the background. `done` resolves at
	// the terminal phase for callers that need the final result.
	const done = run()

	return { taskId, done }
}
