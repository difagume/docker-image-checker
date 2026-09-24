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
import { isContainerUpdateInProgressError } from '@/lib/update-in-progress'
import {
	lookupActiveUpdateTasks,
	type ResolvedUpdateContext,
	resolveTriggerFailureOutcome,
	resolveUpdateContextFromList,
	type UpdateContext
} from '@/lib/update-progress-client'
import {
	type ActiveUpdateTask,
	isTerminalUpdatePhase,
	type UpdatePhase
} from '@/lib/update-progress-store'
import {
	connectUpdateProgress,
	type UpdateProgressData
} from '@/lib/update-progress-stream'
import type { ContainerData } from '@/types/dashboard'

type ActiveStream = {
	taskId: string
	source: EventSource
}

type UpdatePhasesState = Record<
	string,
	{ phase: UpdatePhase; statusText: string; error?: string }
>

/** Bounded reconnection: at most this many active-task lookups per mount. */
const MAX_LOOKUP_ATTEMPTS = 3

/**
 * Backoff steps (ms) between reconnection lookup attempts: 2 s, 4 s, 8 s.
 * The attempt cap stops the sequence after `MAX_LOOKUP_ATTEMPTS` lookups.
 */
const RETRY_BACKOFF_MS = [2_000, 4_000, 8_000]

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

	// Per-container progress replaces the former scalar
	// `updatingContainerId`. A container counts as "updating" while
	// `updatePhases[id]` holds a non-terminal phase, so several cards can
	// show their own spinner/phase label at the same time.
	const [updateError, setUpdateError] = useState<string | null>(null)
	const [updateErrorContainerId, setUpdateErrorContainerId] = useState<
		string | null
	>(null)
	const [updatePhases, setUpdatePhases] = useState<UpdatePhasesState>({})
	const activeStreams = useRef<Record<string, ActiveStream>>({})
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

	// Close and forget the stream for a container. The phase entry itself is
	// owned by `handlePhase`/`handleConnectionError` (there is no separate
	// scalar to clear anymore).
	const finishContainer = (id: string) => {
		activeStreams.current[id]?.source.close()
		delete activeStreams.current[id]
	}

	// Hoisted from `handleUpdateClick` (it used to be a closure per click) so
	// mount-time reconnection reuses the exact same terminal-phase logic. The
	// context is caller-provided: click-initiated updates freeze the requested
	// image/version at trigger time; reconnected streams resolve it per event.
	const handlePhase = (
		id: string,
		data: UpdateProgressData,
		resolved: ResolvedUpdateContext
	) => {
		const ctx = resolved.context
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
				dict.toast.updateError.replace('{container}', ctx.containerName)
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

		// Empty update context: the container is no longer in the local list
		// (removed by a reload), so there is no image/version to apply
		// optimistically, verify against the registry, or celebrate — clearing
		// the phase above is all this event can safely do.
		if (!resolved.hasContext) {
			return
		}

		const newContainerId = data.result?.newContainerId || id
		const newImageId = data.result?.newImageId

		// Refresh the card IMMEDIATELY with optimistic data
		setContainers((prev) =>
			applyOptimisticUpdate(prev, id, {
				imageName: ctx.imageName,
				newVersion: ctx.newVersion,
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
				const updateInfo = await verifyContainerUpdate(ctx.imageName)

				if (updateInfo.hasUpdate) {
					setContainers((prev) =>
						applyVerifiedUpdate(
							prev,
							newContainerId,
							updateInfo,
							ctx.newVersion
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
				.replace('{container}', ctx.containerName)
				.replace('{version}', ctx.newVersion)
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

	// Best-effort context for streams re-attached after a reload, where the
	// click-time arguments no longer exist. The pure resolution logic lives
	// in `resolveUpdateContextFromList`; this wrapper reads the current
	// render's `containers` through the latest-ref below.
	const resolveUpdateContext = (containerId: string): ResolvedUpdateContext =>
		resolveUpdateContextFromList(containerId, containers)

	// Latest-ref pattern: mount-time subscriptions (streams, reconnection)
	// must call the current closures (fresh dict/containers) without
	// re-subscribing whenever they change, so they read handlers through
	// this ref. The ref is refreshed in an effect with no dependency array —
	// after every render — because render must stay side-effect free: under
	// concurrent rendering React may render without committing, and a ref
	// write during render would leak the discarded render's closures into
	// live subscriptions. Declared before the effects that route through it
	// so the first refresh runs before they do.
	const handlersRef = useRef({
		handlePhase,
		handleConnectionError,
		resolveUpdateContext
	})
	useEffect(() => {
		handlersRef.current = {
			handlePhase,
			handleConnectionError,
			resolveUpdateContext
		}
	})

	// Open the SSE stream for a task. At most one live EventSource per
	// container: an identical taskId is already streamed (no-op), a stale
	// different taskId is replaced — closing it first so its late `error`
	// event cannot tear down the new task's progress UI.
	const openProgressStream = (
		containerId: string,
		taskId: string,
		resolveCtx: () => ResolvedUpdateContext
	) => {
		const existing = activeStreams.current[containerId]
		if (existing?.taskId === taskId) return
		existing?.source.close()
		activeStreams.current[containerId] = {
			taskId,
			source: connectUpdateProgress(taskId, {
				onPhase: (data) => {
					// Stale-event guard: a late event from a replaced stream must
					// not drive the UI of the task registered for this container
					// now.
					if (activeStreams.current[containerId]?.taskId !== taskId) return
					handlersRef.current.handlePhase(containerId, data, resolveCtx())
				},
				onConnectionError: () =>
					handlersRef.current.handleConnectionError(containerId)
			})
		}
	}

	// Seed the card with the server's snapshot (never clobbering a live
	// non-terminal local phase) and attach the stream.
	const attachToActiveTask = (containerId: string, task: ActiveUpdateTask) => {
		setUpdatePhases((prev) => {
			const existing = prev[containerId]
			if (existing && !isTerminalUpdatePhase(existing.phase)) {
				return prev
			}
			return {
				...prev,
				[containerId]: { phase: task.phase, statusText: task.statusText }
			}
		})
		openProgressStream(containerId, task.taskId, () =>
			handlersRef.current.resolveUpdateContext(containerId)
		)
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

		// Frozen at trigger time: the pull uses exactly this reference, so the
		// optimistic/verified card state must report these values even if
		// `latestVersion` moves while the update runs.
		const ctx: UpdateContext = { imageName, newVersion, containerName }

		try {
			const { taskId } = await triggerContainerUpdate(containerId, imageName)

			// B-18: only enter updating state after server confirmed task creation
			// so a trigger failure (auth, network, ContainerUpdateInProgressError)
			// never leaves a ghost "Pulling image..." without a backing
			// progressStore task.
			setUpdateError(null)
			setUpdateErrorContainerId(null)
			setUpdatePhases((prev) => ({
				...prev,
				[containerId]: { phase: 'pulling', statusText: 'Starting...' }
			}))
			openProgressStream(containerId, taskId, () => ({
				hasContext: true,
				context: ctx
			}))
		} catch (err) {
			// A duplicate trigger is an EXPECTED outcome, not a failure — the
			// server already runs a task for this container. Identification
			// layers (see `isContainerUpdateInProgressError`): stable
			// digest/name/message markers, plus one corroborating active-task
			// lookup (bounded to 1.5 s so a dead backend cannot stall the UI)
			// for payloads that lost the marker (production flight redaction).
			// The combined outcome decides what the user sees; nothing returns
			// silently.
			const markerMatched = isContainerUpdateInProgressError(err)
			const tasks = await lookupActiveUpdateTasks()
			const task = tasks?.[containerId]
			const outcome = resolveTriggerFailureOutcome(markerMatched, task)

			if (outcome === 'attach' && task) {
				attachToActiveTask(containerId, task)
				return
			}

			// The server has nothing running for this container, so any local
			// phase is stale — clear it either way (B-18: no ghost spinner
			// survives a failed trigger).
			setUpdatePhases((prev) => {
				const next = { ...prev }
				delete next[containerId]
				return next
			})

			if (outcome === 'surface-no-task') {
				// The marker matched but no task backs it: not a failed
				// update, so report it calmly — never the red failure banner.
				toast.info('No update is running for this container right now.')
				return
			}

			// Genuine trigger failure — the trigger failed before task
			// creation.
			showUpdateError(
				containerId,
				err instanceof Error ? err.message : 'Unknown error'
			)
			toast.error(dict.toast.updateError.replace('{container}', containerName))
		}
	}

	// Reconnect to update tasks still running on the server (page reload,
	// new tab): re-attach the SSE stream for every non-terminal task this
	// client is not streaming yet. The lookup is bounded (1.5 s) and retried
	// at most 3 times with a 2 s / 4 s / 8 s backoff when it returns null,
	// so a briefly unavailable API cannot silently drop reconnection. The
	// cancelled flag stops retries, further attachments, and any EventSource
	// opened after unmount; cleanup also clears pending timers and streams.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reconnect once per mount; the handlers it routes through are read from refs
	useEffect(() => {
		let cancelled = false
		let retryTimer: ReturnType<typeof setTimeout> | null = null

		const attemptLookup = async (attempt: number): Promise<void> => {
			const tasks = await lookupActiveUpdateTasks()
			if (cancelled) return
			if (tasks === null) {
				if (attempt + 1 < MAX_LOOKUP_ATTEMPTS) {
					retryTimer = setTimeout(() => {
						retryTimer = null
						if (cancelled) return
						void attemptLookup(attempt + 1)
					}, RETRY_BACKOFF_MS[attempt])
				}
				return
			}
			for (const [containerId, task] of Object.entries(tasks)) {
				if (cancelled) return
				attachToActiveTask(containerId, task)
			}
		}

		void attemptLookup(0)

		// Unmount cleanup: cancel everything in flight (including the retry
		// timer) and close the streams, so nothing opens after unmount.
		return () => {
			cancelled = true
			if (retryTimer) {
				clearTimeout(retryTimer)
				retryTimer = null
			}
			for (const id of Object.keys(activeStreams.current)) {
				activeStreams.current[id]?.source.close()
			}
			activeStreams.current = {}
			if (errorTimerRef.current) {
				clearTimeout(errorTimerRef.current)
			}
		}
	}, [])

	return {
		containers,
		updateError,
		updateErrorContainerId,
		updatePhases,
		handleUpdateClick
	}
}
