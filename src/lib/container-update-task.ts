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
 * The actual Docker update pipeline. Moves a container from its current image
 * to `newImageName`, preserving config (env, ports, binds, networks, restart
 * policy). Shared verbatim between the web action and the Telegram polling
 * path so both flows behave identically (R6).
 */
async function doUpdateContainerImage(
	containerId: string,
	newImageName: string,
	onPhase?: OnPhaseCallback
): Promise<UpdateTaskResult> {
	try {
		const container = docker.getContainer(containerId)
		const containerInfo = await container.inspect()

		const wasRunning = containerInfo.State.Running
		const config = containerInfo.Config
		const hostConfig = containerInfo.HostConfig
		const networkingConfig = containerInfo.NetworkSettings
		const name = containerInfo.Name.replace(/^\//, '')

		console.log(
			`[Image Update] Starting update for container ${containerId}: ${config.Image} -> ${newImageName}`
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

			console.log(`[Image Update] Removing old container ${containerId}...`)
			await container.remove()

			// Phase: recreating
			onPhase?.('recreating', { statusText: 'Recreating container...' })

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
				restartPolicy.MaximumRetryCount =
					hostConfig.RestartPolicy.MaximumRetryCount
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

			console.log(
				`[Image Update] Creating new container with image ${newImageName}...`
			)
			const newContainer = await docker.createContainer({
				name,
				Image: newImageName,
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
			})

			// Phase: starting
			onPhase?.('starting', { statusText: 'Starting container...' })
			console.log(`[Image Update] Starting new container ${newContainer.id}...`)
			await newContainer.start()

			// Phase: verifying
			onPhase?.('verifying', { statusText: 'Verifying update...' })

			// Inspect the new container to get fresh ImageID
			const newContainerInfo = await newContainer.inspect()

			console.log(
				`[Image Update] Successfully updated container ${containerId} -> ${newContainer.id}`
			)

			return {
				success: true,
				newContainerId: newContainer.id.substring(0, 12),
				newImageId: newContainerInfo.Image
			}
		}

		// Container was stopped — still recreate it with the new image
		console.log(
			`[Image Update] Container was stopped, recreating with new image...`
		)

		// Phase: recreating (stopped container)
		onPhase?.('recreating', { statusText: 'Recreating container...' })

		// Remove old container and create a new one with the new image
		await container.remove()

		const newContainer = await docker.createContainer({
			name,
			Image: newImageName,
			Cmd: config.Cmd,
			Env: config.Env,
			WorkingDir: config.WorkingDir || undefined,
			Labels: config.Labels,
			ExposedPorts: config.ExposedPorts || undefined,
			HostConfig: {
				Binds: hostConfig.Binds || undefined,
				PortBindings: hostConfig.PortBindings || undefined,
				RestartPolicy: hostConfig.RestartPolicy,
				NetworkMode: hostConfig.NetworkMode || undefined
			},
			NetworkingConfig: networkingConfig.Networks
				? {
						EndpointsConfig: Object.fromEntries(
							Object.keys(networkingConfig.Networks).map((n) => [n, {}])
						)
					}
				: undefined
		})

		// Phase: verifying
		onPhase?.('verifying', { statusText: 'Verifying update...' })

		const newContainerInfo = await newContainer.inspect()

		console.log(
			`[Image Update] Successfully updated stopped container ${containerId} -> ${newContainer.id}`
		)

		return {
			success: true,
			newContainerId: newContainer.id.substring(0, 12),
			newImageId: newContainerInfo.Image
		}
	} catch (error) {
		console.error(
			`[Image Update] Failed to update container ${containerId}:`,
			error
		)
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
