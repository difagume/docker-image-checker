'use client'

import { useProgress } from '@bprogress/next'
import { useEffect, useRef } from 'react'
import { subscribeRefreshState } from './loading-events'

/**
 * Drives the top progress bar (`@bprogress/next`) while containers refresh.
 *
 * The refresh is not a route navigation (it uses `revalidateTag` + a
 * client-side update check), so the bar is controlled programmatically:
 *  - `start()` when the refresh begins (server-action pending phase).
 *  - `set()` with the real `current/total` ratio during the update check.
 *  - `stop()` (debounced) once everything is idle again, bridging the gap
 *    between the revalidate phase and the check phase to avoid flicker.
 *
 * `lastValueRef` is kept MONOTONIC — it never resets mid-cycle so the bar
 * never jumps backward when transitioning from the server phase (indeterminate)
 * to the client check phase (determinate).
 */
export function RefreshProgressBar() {
	const { start, stop, set } = useProgress()
	const activeRef = useRef(false)
	const lastValueRef = useRef(0)
	const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return subscribeRefreshState((state) => {
			const active = state.formPending || state.checkTotal > 0

			if (active) {
				if (stopTimerRef.current) {
					clearTimeout(stopTimerRef.current)
					stopTimerRef.current = null
				}

				if (!activeRef.current) {
					activeRef.current = true
					// NOT resetting lastValueRef — keep it monotonic across phases
					start()
				}

				if (state.checkTotal > 0) {
					const ratio = state.checkCurrent / state.checkTotal
					// Map real progress into a visible range (max 95%, stop() fills
					// the rest) and keep it monotonic so it never jumps backwards.
					const value = Math.min(
						0.95,
						Math.max(lastValueRef.current, ratio * 0.9)
					)
					lastValueRef.current = value
					set(value)
				}

				return
			}

			if (activeRef.current && !stopTimerRef.current) {
				stopTimerRef.current = setTimeout(() => {
					activeRef.current = false
					lastValueRef.current = 0
					stopTimerRef.current = null
					stop()
				}, 400)
			}
		})
	}, [start, stop, set])

	useEffect(() => {
		return () => {
			if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
		}
	}, [])

	return null
}
