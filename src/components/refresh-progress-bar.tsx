'use client'

import { useProgress } from '@bprogress/react'
import { useEffect, useRef } from 'react'
import { subscribeRefreshState } from './loading-events'

/**
 * Drives the top progress bar (provided by `@bprogress/next/app` in
 * `progress-providers.tsx`) while the refresh server-action is pending.
 *
 * The imperative hook comes from `@bprogress/react` instead of the
 * `@bprogress/next` barrel: the barrel also bundles the pages-router
 * provider, which statically imports `next/router` and drags the whole
 * pages-router client machinery into the shared chunks even though this
 * app is App Router only.
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
