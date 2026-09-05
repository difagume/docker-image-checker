'use client'

import { useEffect, useRef } from 'react'
import { setDashboardSettingsAction } from '@/actions/app-state'
import type { FilterStatus, SortBy, SortDir } from '@/types/app-state'

export function useSettingsSync(
	activeFilters: FilterStatus[],
	showHiddenMode: boolean,
	sortBy: SortBy,
	sortDir: SortDir
) {
	// B-14: the first effect run is hydration — the server just read these
	// values from the state file, so writing them back only churns the mtime.
	const hydrated = useRef(false)
	useEffect(() => {
		if (!hydrated.current) {
			hydrated.current = true
			return
		}
		const timeoutId = setTimeout(() => {
			setDashboardSettingsAction({
				activeFilters,
				showHiddenMode,
				sortBy,
				sortDir
			}).catch((error: Error) => {
				console.error('Failed to sync dashboard settings:', error)
			})
		}, 300)
		return () => clearTimeout(timeoutId)
	}, [activeFilters, showHiddenMode, sortBy, sortDir])
}
