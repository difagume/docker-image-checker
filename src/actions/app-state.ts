'use server'

import {
	collectLiveContainerIds,
	gcHiddenIds,
	gcIgnoredIds,
	getDashboardSettings,
	getHiddenContainerIds,
	getIgnoredNotificationContainerIds,
	getPreferredLanguage,
	remapHiddenIds,
	remapIgnoredIds,
	setDashboardSettings,
	setHiddenContainerIds,
	setIgnoredNotificationContainerIds,
	setPreferredLanguage
} from '@/lib/app-state'
import { requireAuthIfEnabled } from '@/lib/auth-guard'
import type { Locale } from '@/lib/i18n/dictionaries'
import type { FilterStatus, SortBy, SortDir } from '@/types/app-state'

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
	sortBy: SortBy
	sortDir: SortDir
}> {
	await requireAuthIfEnabled()
	return getDashboardSettings()
}

export async function setDashboardSettingsAction(settings: {
	activeFilters?: FilterStatus[]
	showHiddenMode?: boolean
	sortBy?: SortBy
	sortDir?: SortDir
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
	if (
		settings.sortBy !== undefined &&
		!['name', 'status'].includes(settings.sortBy)
	) {
		throw new Error('sortBy must be one of name, status')
	}
	if (
		settings.sortDir !== undefined &&
		!['asc', 'desc'].includes(settings.sortDir)
	) {
		throw new Error('sortDir must be one of asc, desc')
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

export async function remapHiddenIdsAction(
	oldId: string,
	newId: string
): Promise<void> {
	await requireAuthIfEnabled()
	if (typeof oldId !== 'string' || typeof newId !== 'string') {
		throw new Error('remapHiddenIds: ids must be strings')
	}
	await remapHiddenIds(oldId, newId)
}

export async function remapIgnoredIdsAction(
	oldId: string,
	newId: string
): Promise<void> {
	await requireAuthIfEnabled()
	if (typeof oldId !== 'string' || typeof newId !== 'string') {
		throw new Error('remapIgnoredIds: ids must be strings')
	}
	await remapIgnoredIds(oldId, newId)
}

// B-16: liveness is derived server-side from the daemon; the client never
// supplies the list (a cache-derived list purges prefs of live containers).
export async function gcHiddenIdsAction(): Promise<boolean> {
	await requireAuthIfEnabled()
	const liveIds = await collectLiveContainerIds()
	return gcHiddenIds(liveIds)
}

export async function gcIgnoredIdsAction(): Promise<boolean> {
	await requireAuthIfEnabled()
	const liveIds = await collectLiveContainerIds()
	return gcIgnoredIds(liveIds)
}
