'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
	gcHiddenIdsAction,
	gcIgnoredIdsAction,
	remapHiddenIdsAction,
	remapIgnoredIdsAction
} from '@/actions/app-state'
import { triggerContainerUpdate, verifyContainerUpdate } from '@/actions/docker'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { withTag } from '@/lib/image-name'
import type { PolicyState } from '@/lib/policies/types'
import type { UpdatePhase } from '@/lib/update-progress-store'
import type { FilterStatus } from '@/types/app-state'

export interface ReferenceUrlData {
	image: string
	referenceUrl: string
}

export interface ContainerData {
	container: {
		Id: string
		State: string
		Image: string
		ImageID: string
		Status: string
		Names: string[]
	}
	isRunning: boolean
	ports: string
	updateStatus: FilterStatus | 'local'
	containerName: string
	currentVersion?: string
	displayCurrentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
	policyState?: PolicyState
	localDigest?: string
	ghcrError?: 'invalid_token'
}

export function useContainerUpdates(
	processedContainers: ContainerData[],
	dict: Dictionary
) {
	const [containers, setContainers] =
		useState<ContainerData[]>(processedContainers)

	// GC orphaned hidden/ignored prefs on mount and on refresh. B-16: the
	// actions derive liveness server-side from the daemon — a client-supplied
	// list comes from the (possibly stale) cached inventory and would purge
	// prefs of live containers.
	// biome-ignore lint/correctness/useExhaustiveDependencies: rerun GC whenever the dashboard receives a fresh (post-refresh) container list
	useEffect(() => {
		gcHiddenIdsAction().catch((err) =>
			console.warn('[GC] gcHiddenIds failed:', err)
		)
		gcIgnoredIdsAction().catch((err) =>
			console.warn('[GC] gcIgnoredIds failed:', err)
		)
	}, [processedContainers])

	const [updatingContainerId, setUpdatingContainerId] = useState<string | null>(
		null
	)
	const [updateError, setUpdateError] = useState<string | null>(null)
	const [updatePhases, setUpdatePhases] = useState<
		Record<string, { phase: UpdatePhase; statusText: string; error?: string }>
	>({})
	const activeEventSources = useRef<Record<string, EventSource>>({})

	// Sync containers state with props when they change
	useEffect(() => {
		setContainers(processedContainers)
	}, [processedContainers])

	const handleUpdateClick = async (
		containerId: string,
		containerImage: string,
		newVersion: string
	) => {
		setUpdatingContainerId(containerId)
		setUpdateError(null)
		setUpdatePhases((prev) => ({
			...prev,
			[containerId]: { phase: 'pulling', statusText: 'Starting...' }
		}))

		const imageName = withTag(containerImage, newVersion)

		const containerName =
			containers.find((c) => c.container.Id === containerId)?.containerName ||
			containerId.substring(0, 12)

		try {
			const { taskId } = await triggerContainerUpdate(containerId, imageName)

			const eventSource = new EventSource(
				`/api/update-progress?taskId=${taskId}`
			)
			activeEventSources.current[containerId] = eventSource

			eventSource.addEventListener('phase', (event: MessageEvent) => {
				const data = JSON.parse(event.data) as {
					phase: UpdatePhase
					statusText: string
					error?: string
					result?: { newContainerId?: string; newImageId?: string }
				}

				setUpdatePhases((prev) => ({
					...prev,
					[containerId]: {
						phase: data.phase,
						statusText: data.statusText,
						error: data.error
					}
				}))

				if (data.phase === 'error') {
					eventSource.close()
					delete activeEventSources.current[containerId]
					setUpdatingContainerId(null)
					setUpdateError(data.error || 'Update failed')
					setTimeout(() => setUpdateError(null), 5000)
					toast.error(
						dict.toast.updateError.replace('{container}', containerName)
					)
				}

				if (data.phase === 'done') {
					eventSource.close()
					delete activeEventSources.current[containerId]
					setUpdatingContainerId(null)

					// Clean up updatePhase — the update is complete
					setUpdatePhases((prev) => {
						const next = { ...prev }
						delete next[containerId]
						return next
					})

					const newContainerId = data.result?.newContainerId || containerId
					const newImageId = data.result?.newImageId

					// Refresh the card IMMEDIATELY with optimistic data
					setContainers((prev) =>
						prev.map((c) =>
							c.container.Id === containerId
								? {
										...c,
										displayCurrentVersion: newVersion,
										currentVersion: newVersion,
										latestVersion: newVersion,
										isUpToDate: true,
										updateStatus: 'updated' as FilterStatus,
										container: {
											...c.container,
											Id: newContainerId,
											Image: imageName,
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
								: c
						)
					)

					// Orphan remap: migrate hidden/ignored Ids when container was recreated
					if (newContainerId !== containerId) {
						remapHiddenIdsAction(containerId, newContainerId).catch((err) =>
							console.warn('[Remap] remapHiddenIds failed:', err)
						)
						remapIgnoredIdsAction(containerId, newContainerId).catch((err) =>
							console.warn('[Remap] remapIgnoredIds failed:', err)
						)
					}
					// Verify in background (async IIFE inside non-async callback)
					;(async () => {
						try {
							const updateInfo = await verifyContainerUpdate(imageName)

							if (updateInfo.hasUpdate) {
								setContainers((prev) =>
									prev.map((c) =>
										c.container.Id === newContainerId
											? {
													...c,
													latestVersion: updateInfo.latestVersion || newVersion,
													isUpToDate: false,
													updateStatus: 'available' as FilterStatus,
													dockerHubUrl: updateInfo.dockerHubUrl,
													policyState: updateInfo.policyState
												}
											: c
									)
								)
							}
						} catch (verifyErr) {
							console.warn(
								'[Update] Post-update verification failed, but container was updated:',
								verifyErr
							)
						}
					})()

					toast.success(
						dict.toast.updateSuccess
							.replace('{container}', containerName)
							.replace('{version}', newVersion)
					)
				}
			})

			eventSource.addEventListener('error', () => {
				// Connection-level error (not a phase error)
				eventSource.close()
				delete activeEventSources.current[containerId]

				// Only handle if we haven't already processed done/error
				setUpdatePhases((prev) => {
					if (
						prev[containerId]?.phase === 'done' ||
						prev[containerId]?.phase === 'error'
					) {
						return prev
					}
					const next = { ...prev }
					delete next[containerId]
					return next
				})
				setUpdatingContainerId(null)
				setUpdateError('Connection lost')
				setTimeout(() => setUpdateError(null), 5000)
			})
		} catch (err) {
			setUpdatingContainerId(null)
			setUpdatePhases((prev) => {
				const next = { ...prev }
				delete next[containerId]
				return next
			})
			setUpdateError(err instanceof Error ? err.message : 'Unknown error')
			setTimeout(() => setUpdateError(null), 5000)
			toast.error(dict.toast.updateError.replace('{container}', containerName))
		}
	}

	// Clean up active EventSources on unmount
	useEffect(() => {
		return () => {
			for (const id of Object.keys(activeEventSources.current)) {
				activeEventSources.current[id]?.close()
			}
			activeEventSources.current = {}
		}
	}, [])

	return {
		containers,
		updatingContainerId,
		updateError,
		updatePhases,
		handleUpdateClick
	}
}
