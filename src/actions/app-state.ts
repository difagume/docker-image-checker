'use server'

import {
	getDashboardSettings,
	getHiddenContainerIds,
	getIgnoredNotificationContainerIds,
	getPreferredLanguage,
	setDashboardSettings,
	setHiddenContainerIds,
	setIgnoredNotificationContainerIds,
	setPreferredLanguage
} from '@/lib/app-state'
import type { Locale } from '@/lib/i18n/dictionaries'
import { getSession } from '@/lib/session'
import type { FilterStatus } from '@/types/app-state'

async function requireAuthIfEnabled() {
	if (!process.env.AUTH_HTPASSWD) return
	const session = await getSession()
	if (!session.isLoggedIn) {
		throw new Error('Unauthorized')
	}
}

export async function getHiddenContainerIdsAction(): Promise<string[]> {
	await requireAuthIfEnabled()
	return getHiddenContainerIds()
}

export async function setHiddenContainerIdsAction(
	ids: string[]
): Promise<void> {
	await requireAuthIfEnabled()
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
		throw new Error('hiddenContainerIds must be a string array')
	}
	await setHiddenContainerIds(ids)
}

export async function getIgnoredNotificationContainerIdsAction(): Promise<
	string[]
> {
	await requireAuthIfEnabled()
	return getIgnoredNotificationContainerIds()
}

export async function setIgnoredNotificationContainerIdsAction(
	ids: string[]
): Promise<void> {
	await requireAuthIfEnabled()
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
		throw new Error('ignoredNotificationIds must be a string array')
	}
	await setIgnoredNotificationContainerIds(ids)
}

export async function getDashboardSettingsAction(): Promise<{
	activeFilters: FilterStatus[]
	showHiddenMode: boolean
}> {
	await requireAuthIfEnabled()
	return getDashboardSettings()
}

export async function setDashboardSettingsAction(settings: {
	activeFilters?: FilterStatus[]
	showHiddenMode?: boolean
}): Promise<void> {
	await requireAuthIfEnabled()
	if (
		settings.activeFilters &&
		(!Array.isArray(settings.activeFilters) ||
			!settings.activeFilters.every((status) => typeof status === 'string'))
	) {
		throw new Error('activeFilters must be a string array')
	}
	if (
		settings.showHiddenMode !== undefined &&
		typeof settings.showHiddenMode !== 'boolean'
	) {
		throw new Error('showHiddenMode must be boolean')
	}
	await setDashboardSettings(settings)
}

export async function getPreferredLanguageAction(): Promise<string> {
	await requireAuthIfEnabled()
	return getPreferredLanguage()
}

export async function setPreferredLanguageAction(
	language: Locale
): Promise<void> {
	await requireAuthIfEnabled()
	if (!['en', 'es', 'pt'].includes(language)) {
		throw new Error('Invalid language')
	}
	await setPreferredLanguage(language)
}
