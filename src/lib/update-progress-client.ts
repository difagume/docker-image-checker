import { withTag } from '@/lib/image-name'
import type { ActiveUpdateTask } from '@/lib/update-progress-store'
import type { ContainerData } from '@/types/dashboard'

/**
 * Context consumed when an update reaches a terminal phase. The click path
 * freezes it at trigger time (the image/version actually requested);
 * streams re-attached after a reload resolve it from the latest container
 * list at event time (see `resolveUpdateContextFromList`).
 */
export interface UpdateContext {
	imageName: string
	newVersion: string
	containerName: string
}

/**
 * Result of resolving a context against the current container list.
 * `hasContext` is false when the container is absent (e.g. removed by a
 * reload): `context` then carries display fallbacks only and must not drive
 * optimistic updates, registry verification, or version-bearing toasts.
 */
export interface ResolvedUpdateContext {
	hasContext: boolean
	context: UpdateContext
}

/** Non-terminal server tasks keyed by container id. */
export type ActiveUpdateTasks = Record<string, ActiveUpdateTask>

/** Read-only lookup behind `GET /api/update-progress/active`. */
export const ACTIVE_UPDATE_TASKS_URL = '/api/update-progress/active'

/** Abort the active-task lookup after this long; a dead backend must not stall the UI. */
export const ACTIVE_TASK_LOOKUP_TIMEOUT_MS = 1500

/**
 * What to do after `triggerContainerUpdate` rejected:
 * - `attach`: a live server task exists for this container — seed the phase
 *   and re-attach the stream; the existing progress UI stays untouched.
 * - `surface-lookup-failed`: the in-progress marker matched but the
 *   active-task endpoint could not be reached, so nothing is confirmed —
 *   tell the user calmly that the check itself failed; never claim that no
 *   update is running.
 * - `surface-no-task`: the in-progress marker matched AND the server
 *   answered the lookup without a task for this container — it confirmed
 *   nothing is running, so the local phase is stale; clear it and tell the
 *   user calmly (not a failure).
 * - `surface-failure`: a genuine trigger failure — show the error banner and
 *   the failure toast.
 */
export type TriggerFailureOutcome =
	| 'attach'
	| 'surface-lookup-failed'
	| 'surface-no-task'
	| 'surface-failure'

/**
 * Decision table for a failed update trigger. `markerMatched` is the result
 * of `isContainerUpdateInProgressError(err)`; `lookup` is the FULL result of
 * `lookupActiveUpdateTasks`: an object when the server answered (it may be
 * empty or simply lack `containerId`) or `null` when the lookup itself
 * failed. Only an answered lookup may justify `surface-no-task`; a `null`
 * lookup with a matched marker reports the failed check instead.
 */
export function resolveTriggerFailureOutcome(
	markerMatched: boolean,
	lookup: ActiveUpdateTasks | null,
	containerId: string
): TriggerFailureOutcome {
	if (lookup === null) {
		return markerMatched ? 'surface-lookup-failed' : 'surface-failure'
	}
	if (lookup[containerId]) return 'attach'
	return markerMatched ? 'surface-no-task' : 'surface-failure'
}

/**
 * Best-effort context for streams re-attached after a reload, where the
 * click-time arguments no longer exist. Mirrors the display-version
 * fallback in `container-card.tsx` so `done` reports the values a
 * click-initiated update would have used. When the container is not in the
 * list anymore, resolves with `hasContext: false` and an empty image/version.
 */
export function resolveUpdateContextFromList(
	containerId: string,
	containers: ContainerData[]
): ResolvedUpdateContext {
	const item = containers.find((c) => c.container.Id === containerId)
	if (!item) {
		return {
			hasContext: false,
			context: {
				imageName: '',
				newVersion: '',
				containerName: containerId.substring(0, 12)
			}
		}
	}
	const newVersion =
		item.latestVersion !== 'latest' &&
		item.latestVersion !== 'Unknown' &&
		item.latestVersion !== undefined
			? item.latestVersion
			: 'latest'
	return {
		hasContext: true,
		context: {
			imageName: withTag(item.container.Image, newVersion),
			newVersion,
			containerName: item.containerName || containerId.substring(0, 12)
		}
	}
}

/** Minimal fetch surface so tests can inject an implementation. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Read-only lookup of non-terminal server tasks, bounded by an
 * `AbortController` timeout. Resolves `null` and logs a `console.warn` on
 * every failure branch (non-OK status, abort/timeout, network or parse
 * error) so a dead backend can neither stall nor silently disable the UI;
 * callers may retry on `null`.
 */
export async function lookupActiveUpdateTasks(
	fetchImpl: FetchLike = fetch,
	timeoutMs: number = ACTIVE_TASK_LOOKUP_TIMEOUT_MS
): Promise<ActiveUpdateTasks | null> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const res = await fetchImpl(ACTIVE_UPDATE_TASKS_URL, {
			signal: controller.signal
		})
		if (!res.ok) {
			console.warn(
				'[Update] active-task lookup returned non-OK status:',
				res.status
			)
			return null
		}
		const data = (await res.json()) as { tasks?: ActiveUpdateTasks }
		return data.tasks ?? {}
	} catch (err) {
		if (controller.signal.aborted) {
			console.warn(
				`[Update] active-task lookup aborted (timeout ${timeoutMs}ms):`,
				err
			)
		} else {
			console.warn('[Update] active-task lookup failed:', err)
		}
		return null
	} finally {
		clearTimeout(timer)
	}
}
