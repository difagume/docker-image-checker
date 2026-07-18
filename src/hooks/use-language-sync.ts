'use client'

import { useEffect } from 'react'
import { setPreferredLanguageAction } from '@/actions/app-state'
import type { Locale } from '@/lib/i18n/dictionaries'

export function useLanguageSync(locale: Locale, notificationsEnabled: boolean) {
	useEffect(() => {
		if (!notificationsEnabled) return
		const timeoutId = setTimeout(() => {
			setPreferredLanguageAction(locale).catch((error: Error) => {
				console.warn('Failed to sync preferred language:', error)
			})
		}, 300)
		return () => clearTimeout(timeoutId)
	}, [locale, notificationsEnabled])
}
