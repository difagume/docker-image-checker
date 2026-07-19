'use client'

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
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
	getReferenceUrls: (
		imageName: string
	) => ReferenceUrlData | undefined
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
	const [hiddenContainerIds, setHiddenContainerIds] = useState<string[]>(
		initialHiddenIds
	)
	const [ignoredNotificationIds, setIgnoredNotificationIds] = useState<
		string[]
	>(initialIgnoredIds)
	const [referenceUrls, setReferenceUrls] = useState<
		Record<string, ReferenceUrlData>
	>(initialReferenceUrls)

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
					if (notificationsEnabled) {
						setIgnoredNotificationIds(ignoredIds)
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
		[hiddenContainerIds, ignoredNotificationIds, referenceUrls, notificationsEnabled]
	)

	const toggleHideContainer = useCallback((id: string) => {
		setHiddenContainerIds((prev) => {
			const newHiddenIds = prev.includes(id)
				? prev.filter((i) => i !== id)
				: [...prev, id]
			setHiddenContainerIdsAction(newHiddenIds).catch((error) => {
				console.error('Failed to sync hidden containers:', error)
			})
			return newHiddenIds
		})
	}, [])

	const toggleIgnoreNotification = useCallback((id: string) => {
		setIgnoredNotificationIds((prev) => {
			const newIgnoredIds = prev.includes(id)
				? prev.filter((i) => i !== id)
				: [...prev, id]
			setIgnoredNotificationContainerIdsAction(newIgnoredIds).catch(
				(error) => {
					console.error('Failed to sync ignored containers:', error)
				}
			)
			return newIgnoredIds
		})
	}, [])

	const saveReferenceUrl = useCallback(
		(imageName: string, url: string) => {
			setReferenceUrls((prev: Record<string, ReferenceUrlData>) => ({
				...prev,
				[imageName]: {
					image: imageName,
					referenceUrl: url
				}
			}))
			saveReferenceUrlAction(imageName, url)
		},
		[]
	)

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
