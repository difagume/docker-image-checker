'use client'

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import {
	getHiddenContainerIdsAction,
	getIgnoredNotificationContainerIdsAction,
	setHiddenContainerIdsAction,
	setIgnoredNotificationContainerIdsAction
} from '@/actions/app-state'
import {
	getReferenceUrlsAction,
	saveReferenceUrlAction
} from '@/actions/reference-url'
import type { ReferenceUrlData } from '@/hooks/use-container-updates'

interface DashboardState {
	hiddenContainerIds: string[]
	ignoredNotificationIds: string[]
	referenceUrls: Record<string, ReferenceUrlData>
	notificationsEnabled: boolean
}

interface DashboardActions {
	toggleHideContainer: (id: string) => void
	toggleIgnoreNotification: (id: string) => void
	saveReferenceUrl: (imageName: string, url: string) => void
	isHidden: (id: string) => boolean
	isIgnored: (id: string) => boolean
	getReferenceUrls: (imageName: string) => ReferenceUrlData | undefined
}

interface DashboardContextValue {
	state: DashboardState
	actions: DashboardActions
}

interface DashboardProviderProps {
	children: React.ReactNode
	initialHiddenIds?: string[]
	initialIgnoredIds?: string[]
	initialReferenceUrls?: Record<string, ReferenceUrlData>
	notificationsEnabled?: boolean
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({
	children,
	initialHiddenIds = [],
	initialIgnoredIds = [],
	initialReferenceUrls = {},
	notificationsEnabled = false
}: DashboardProviderProps) {
	const [hiddenContainerIds, setHiddenContainerIds] =
		useState<string[]>(initialHiddenIds)
	const [ignoredNotificationIds, setIgnoredNotificationIds] =
		useState<string[]>(initialIgnoredIds)
	const [referenceUrls, setReferenceUrls] =
		useState<Record<string, ReferenceUrlData>>(initialReferenceUrls)

	// Mirrors of the latest list state so rapid consecutive toggles compute
	// from what was actually persisted, not from a stale render closure.
	const hiddenContainerIdsRef = useRef(initialHiddenIds)
	const ignoredNotificationIdsRef = useRef(initialIgnoredIds)

	// Load initial state from server on mount
	useEffect(() => {
		let isCancelled = false

		const loadInitialState = async () => {
			try {
				const [hiddenIds, ignoredIds, urls] = await Promise.all([
					getHiddenContainerIdsAction(),
					notificationsEnabled
						? getIgnoredNotificationContainerIdsAction()
						: Promise.resolve<string[]>([]),
					getReferenceUrlsAction()
				])

				if (!isCancelled) {
					setHiddenContainerIds(hiddenIds)
					hiddenContainerIdsRef.current = hiddenIds
					if (notificationsEnabled) {
						setIgnoredNotificationIds(ignoredIds)
						ignoredNotificationIdsRef.current = ignoredIds
					}
					setReferenceUrls(urls)
				}
			} catch (error) {
				console.error('Failed to load dashboard state:', error)
			}
		}

		loadInitialState()

		return () => {
			isCancelled = true
		}
	}, [notificationsEnabled])

	const state = useMemo<DashboardState>(
		() => ({
			hiddenContainerIds,
			ignoredNotificationIds,
			referenceUrls,
			notificationsEnabled
		}),
		[
			hiddenContainerIds,
			ignoredNotificationIds,
			referenceUrls,
			notificationsEnabled
		]
	)

	const toggleHideContainer = useCallback((id: string) => {
		const prev = hiddenContainerIdsRef.current
		const next = prev.includes(id)
			? prev.filter((i) => i !== id)
			: [...prev, id]
		hiddenContainerIdsRef.current = next
		setHiddenContainerIds(next)
		setHiddenContainerIdsAction(next).catch((error) => {
			console.error('Failed to sync hidden containers:', error)
		})
	}, [])

	const toggleIgnoreNotification = useCallback((id: string) => {
		const prev = ignoredNotificationIdsRef.current
		const next = prev.includes(id)
			? prev.filter((i) => i !== id)
			: [...prev, id]
		ignoredNotificationIdsRef.current = next
		setIgnoredNotificationIds(next)
		setIgnoredNotificationContainerIdsAction(next).catch((error) => {
			console.error('Failed to sync ignored containers:', error)
		})
	}, [])

	const saveReferenceUrl = useCallback((imageName: string, url: string) => {
		setReferenceUrls((prev: Record<string, ReferenceUrlData>) => ({
			...prev,
			[imageName]: {
				image: imageName,
				referenceUrl: url
			}
		}))
		saveReferenceUrlAction(imageName, url).catch((error) => {
			console.error('Failed to save reference URL:', error)
		})
	}, [])

	const isHidden = useCallback(
		(id: string) => hiddenContainerIds.includes(id),
		[hiddenContainerIds]
	)

	const isIgnored = useCallback(
		(id: string) => ignoredNotificationIds.includes(id),
		[ignoredNotificationIds]
	)

	const getReferenceUrlsCallback = useCallback(
		(imageName: string) => referenceUrls[imageName],
		[referenceUrls]
	)

	const actions = useMemo<DashboardActions>(
		() => ({
			toggleHideContainer,
			toggleIgnoreNotification,
			saveReferenceUrl,
			isHidden,
			isIgnored,
			getReferenceUrls: getReferenceUrlsCallback
		}),
		[
			toggleHideContainer,
			toggleIgnoreNotification,
			saveReferenceUrl,
			isHidden,
			isIgnored,
			getReferenceUrlsCallback
		]
	)

	const value = useMemo<DashboardContextValue>(
		() => ({ state, actions }),
		[state, actions]
	)

	return (
		<DashboardContext.Provider value={value}>
			{children}
		</DashboardContext.Provider>
	)
}

export function useDashboard(): DashboardContextValue {
	const context = useContext(DashboardContext)
	if (!context) {
		throw new Error('useDashboard must be used within a DashboardProvider')
	}
	return context
}
