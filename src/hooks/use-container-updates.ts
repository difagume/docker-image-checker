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
import {
	applyOptimisticUpdate,
	applyVerifiedUpdate
} from '@/lib/optimistic-update'
import type { UpdatePhase } from '@/lib/update-progress-store'
import {
	connectUpdateProgress,
	type UpdateProgressData
} from '@/lib/update-progress-stream'
import type { ContainerData } from '@/types/dashboard'

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

	// Sync containers state with props when they change
	useEffect(() => {
		setContainers(processedContainers)
	}, [processedContainers])

	const [updatingContainerId, setUpdatingContainerId] = useState<string | null>(
		null
	)
	const [updateError, setUpdateError] = useState<string | null>(null)
	const [updateErrorContainerId, setUpdateErrorContainerId] = useState<
		string | null
	>(null)
	const [updatePhases, setUpdatePhases] = useState<
		Record<string, { phase: UpdatePhase; statusText: string; error?: string }>
	>({})
	const activeEventSources = useRef<Record<string, EventSource>>({})
	const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Flash an error banner for the container, auto-clearing after 5s. A single
	// shared timer keeps consecutive failures from clearing each other early.
	const showUpdateError = (containerId: string, message: string) => {
		if (errorTimerRef.current) {
			clearTimeout(errorTimerRef.current)
		}
		setUpdateError(message)
		setUpdateErrorContainerId(containerId)
		errorTimerRef.current = setTimeout(() => {
			setUpdateError(null)
			setUpdateErrorContainerId(null)
			errorTimerRef.current = null
		}, 5000)
	}

	const handleUpdateClick = async (
		containerId: string,
		containerImage: string,
		newVersion: string
	) => {
		const imageName = withTag(containerImage, newVersion)

		const containerName =
			containers.find((c) => c.container.Id === containerId)?.containerName ||
			containerId.substring(0, 12)

		const finishContainer = (id: string) => {
			activeEventSources.current[id]?.close()
			delete activeEventSources.current[id]
			setUpdatingContainerId((prev) => (prev === id ? null : prev))
		}

		const handlePhase = (id: string, data: UpdateProgressData) => {
			setUpdatePhases((prev) => ({
				...prev,
				[id]: {
					phase: data.phase,
					statusText: data.statusText,
					error: data.error
				}
			}))

			if (data.phase === 'error') {
				finishContainer(id)
				showUpdateError(id, data.error || 'Update failed')
				toast.error(
					dict.toast.updateError.replace('{container}', containerName)
				)
				return
			}

			if (data.phase !== 'done') {
				return
			}

			// Clean up updatePhase — the update is complete
			setUpdatePhases((prev) => {
				const next = { ...prev }
				delete next[id]
				return next
			})

			const newContainerId = data.result?.newContainerId || id
			const newImageId = data.result?.newImageId

			// Refresh the card IMMEDIATELY with optimistic data
			setContainers((prev) =>
				applyOptimisticUpdate(prev, id, {
					imageName,
					newVersion,
					newContainerId,
					newImageId
				})
			)

			// Orphan remap: migrate hidden/ignored Ids when container was recreated
			if (newContainerId !== id) {
				remapHiddenIdsAction(id, newContainerId).catch((err) =>
					console.warn('[Remap] remapHiddenIds failed:', err)
				)
				remapIgnoredIdsAction(id, newContainerId).catch((err) =>
					console.warn('[Remap] remapIgnoredIds failed:', err)
				)
			}
			// Verify in background (async IIFE inside non-async callback)
			;(async () => {
				try {
					const updateInfo = await verifyContainerUpdate(imageName)

					if (updateInfo.hasUpdate) {
						setContainers((prev) =>
							applyVerifiedUpdate(prev, newContainerId, updateInfo, newVersion)
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

		const handleConnectionError = (id: string) => {
			// Connection-level error (not a phase error). Only clear the phase if
			// done/error hasn't already been processed.
			setUpdatePhases((prev) => {
				if (prev[id]?.phase === 'done' || prev[id]?.phase === 'error') {
					return prev
				}
				const next = { ...prev }
				delete next[id]
				return next
			})
			finishContainer(id)
			showUpdateError(id, 'Connection lost')
		}

		try {
			const { taskId } = await triggerContainerUpdate(containerId, imageName)

			// B-18: only enter updating state after server confirmed task creation
			// so a trigger failure (auth, red, ContainerUpdateInProgressError) never
			// leaves a ghost "Pulling image..." without a backing progressStore task.
			setUpdatingContainerId(containerId)
			setUpdateError(null)
			setUpdateErrorContainerId(null)
			setUpdatePhases((prev) => ({
				...prev,
				[containerId]: { phase: 'pulling', statusText: 'Starting...' }
			}))

			activeEventSources.current[containerId] = connectUpdateProgress(taskId, {
				onPhase: (data) => handlePhase(containerId, data),
				onConnectionError: () => handleConnectionError(containerId)
			})
		} catch (err) {
			// B-18: trigger failed before task creation — ensure no ghost spinner remains
			setUpdatingContainerId((prev) => (prev === containerId ? null : prev))
			setUpdatePhases((prev) => {
				const next = { ...prev }
				delete next[containerId]
				return next
			})
			showUpdateError(
				containerId,
				err instanceof Error ? err.message : 'Unknown error'
			)
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
			if (errorTimerRef.current) {
				clearTimeout(errorTimerRef.current)
			}
		}
	}, [])

	return {
		containers,
		updatingContainerId,
		updateError,
		updateErrorContainerId,
		updatePhases,
		handleUpdateClick
	}
}
