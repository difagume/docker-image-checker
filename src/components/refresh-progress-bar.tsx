'use client'

import { useProgress } from '@bprogress/next'
import { useEffect, useRef } from 'react'
import { subscribeRefreshState } from './loading-events'

/**
 * Drives the top progress bar (`@bprogress/next`) while the refresh
 * server-action is pending.
 *
 * The refresh is not a route navigation, so the bar is controlled
 * programmatically: `start()` while the action is pending and `stop()`
 * (debounced) once idle again, bridging the re-render gap to avoid flicker.
 */
export function RefreshProgressBar() {
	const { start, stop } = useProgress()
	const activeRef = useRef(false)
	const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return subscribeRefreshState((state) => {
			if (state.formPending) {
				if (stopTimerRef.current) {
					clearTimeout(stopTimerRef.current)
					stopTimerRef.current = null
				}

				if (!activeRef.current) {
					activeRef.current = true
					start()
				}

				return
			}

			if (activeRef.current && !stopTimerRef.current) {
				stopTimerRef.current = setTimeout(() => {
					activeRef.current = false
					stopTimerRef.current = null
					stop()
				}, 400)
			}
		})
	}, [start, stop])

	useEffect(() => {
		return () => {
			if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
		}
	}, [])

	return null
}
