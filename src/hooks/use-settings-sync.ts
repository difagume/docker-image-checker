'use client'

import { useEffect } from 'react'
import { setDashboardSettingsAction } from '@/actions/app-state'
import type { FilterStatus } from '@/types/app-state'

export function useSettingsSync(
	activeFilters: FilterStatus[],
	showHiddenMode: boolean
) {
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setDashboardSettingsAction({ activeFilters, showHiddenMode }).catch(
				(error: Error) => {
					console.error('Failed to sync dashboard settings:', error)
				}
			)
		}, 300)
		return () => clearTimeout(timeoutId)
	}, [activeFilters, showHiddenMode])
}
