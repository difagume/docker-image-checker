'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
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
import { ContainerCard } from '@/components/container-card'
import { SearchBar } from '@/components/search-bar'
import type {
	ContainerData,
	ReferenceUrlData
} from '@/hooks/use-container-updates'
import { useContainerUpdates } from '@/hooks/use-container-updates'
import { useLanguageSync } from '@/hooks/use-language-sync'
import { useSettingsSync } from '@/hooks/use-settings-sync'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import type { FilterStatus } from '@/types/app-state'
import { StatsSummary } from './stats-summary'
import { UpdateConfirmDialog } from './update-confirm-dialog'

interface ContainerDashboardProps {
	processedContainers: ContainerData[]
	stats: {
		updated: number
		available: number
		unknown: number
	}
	dict: Dictionary
	locale: Locale
	notificationsEnabled?: boolean
	initialActiveFilters?: FilterStatus[]
	initialShowHiddenMode?: boolean
}

export function ContainerDashboard({
	processedContainers,
	dict,
	locale,
	notificationsEnabled = false,
	initialActiveFilters = ['updated', 'available', 'unknown'],
	initialShowHiddenMode = false
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] =
		useState<FilterStatus[]>(initialActiveFilters)
	const [hiddenContainerIds, setHiddenContainerIds] = useState<string[]>([])
	const [ignoredNotificationIds, setIgnoredNotificationIds] = useState<
		string[]
	>([])
	const [showHiddenMode, setShowHiddenMode] = useState(initialShowHiddenMode)
	const [searchQuery, setSearchQuery] = useState('')
	const [debouncedQuery, setDebouncedQuery] = useState('')
	const [referenceUrls, setReferenceUrls] = useState<
		Record<string, ReferenceUrlData>
	>({})
	const [confirmUpdateState, setConfirmUpdateState] = useState<{
		containerId: string
		containerName: string
		containerImage: string
		containerVersion: string
		newVersion: string
		isRunning: boolean
	} | null>(null)

	const prefersReducedMotion = useReducedMotion()

	const { containers, updatingContainerId, updateError, handleUpdateClick } =
		useContainerUpdates(processedContainers, dict)

	useSettingsSync(activeFilters, showHiddenMode)
	useLanguageSync(locale, notificationsEnabled)

	// Derive stats dynamically from containers state
	const dynamicStats = useMemo(() => {
		return {
			updated: containers.filter((c) => c.updateStatus === 'updated').length,
			available: containers.filter((c) => c.updateStatus === 'available')
				.length,
			unknown: containers.filter(
				(c) =>
					c.updateStatus === 'unknown' ||
					c.updateStatus === 'local' ||
					c.updateStatus === 'checking'
			).length
		}
	}, [containers])

	// Load initial configuration and state from API
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

	// Debounce search query
	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedQuery(searchQuery)
		}, 400)
		return () => clearTimeout(handler)
	}, [searchQuery])

	const toggleHideContainer = (id: string) => {
		const newHiddenIds = hiddenContainerIds.includes(id)
			? hiddenContainerIds.filter((i) => i !== id)
			: [...hiddenContainerIds, id]

		setHiddenContainerIds(newHiddenIds)

		// Sync with server
		setHiddenContainerIdsAction(newHiddenIds).catch((error) => {
			console.error('Failed to sync hidden containers:', error)
		})
	}

	const toggleIgnoreNotification = (id: string) => {
		const newIgnoredIds = ignoredNotificationIds.includes(id)
			? ignoredNotificationIds.filter((i) => i !== id)
			: [...ignoredNotificationIds, id]

		setIgnoredNotificationIds(newIgnoredIds)

		// Sync with server
		setIgnoredNotificationContainerIdsAction(newIgnoredIds).catch((error) => {
			console.error('Failed to sync ignored containers:', error)
		})
	}

	const toggleFilter = (status: FilterStatus) => {
		setActiveFilters((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status]
		)
	}

	const handleSaveReferenceUrl = (imageName: string, url: string) => {
		setReferenceUrls((prev: Record<string, ReferenceUrlData>) => ({
			...prev,
			[imageName]: {
				image: imageName,
				referenceUrl: url
			}
		}))
		saveReferenceUrlAction(imageName, url)
	}

	const filteredContainers = useMemo(() => {
		return containers.filter((item) => {
			const statusForFilter =
				item.updateStatus === 'local' || item.updateStatus === 'checking'
					? 'unknown'
					: item.updateStatus
			const isStatusMatch = activeFilters.includes(
				statusForFilter as FilterStatus
			)
			const isHidden = hiddenContainerIds.includes(item.container.Id)

			let isTextMatch = true
			if (debouncedQuery) {
				const q = debouncedQuery.toLowerCase()
				const nameMatch = item.containerName.toLowerCase().includes(q)
				const imageMatch = item.container.Image.toLowerCase().includes(q)
				const currentVerMatch = item.displayCurrentVersion
					?.toLowerCase()
					.includes(q)
				const latestVerMatch =
					item.latestVersion?.toLowerCase().includes(q) || false

				isTextMatch =
					nameMatch || imageMatch || currentVerMatch || latestVerMatch
			}

			if (showHiddenMode) {
				return isStatusMatch && isTextMatch
			}

			return isStatusMatch && !isHidden && isTextMatch
		})
	}, [
		containers,
		activeFilters,
		hiddenContainerIds,
		debouncedQuery,
		showHiddenMode
	])

	return (
		<>
			<StatsSummary
				updatedCount={dynamicStats.updated}
				availableCount={dynamicStats.available}
				unknownCount={dynamicStats.unknown}
				activeFilters={activeFilters}
				onToggleFilter={toggleFilter}
				showHiddenMode={showHiddenMode}
				onToggleShowHidden={() => setShowHiddenMode(!showHiddenMode)}
				dict={dict.stats}
			/>

			<SearchBar
				searchQuery={searchQuery}
				debouncedQuery={debouncedQuery}
				onSearchChange={setSearchQuery}
				onClear={() => {
					setSearchQuery('')
					setDebouncedQuery('')
				}}
				filteredCount={filteredContainers.length}
				totalCount={containers.length}
				dict={dict.filter}
			/>

			<motion.div layout={prefersReducedMotion ? false : true} className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
				<AnimatePresence mode='popLayout'>
					{filteredContainers.map((item) => (
						<ContainerCard
							key={item.container.Id}
							item={item}
							dict={dict}
							locale={locale}
							notificationsEnabled={notificationsEnabled}
							hiddenContainerIds={hiddenContainerIds}
							ignoredNotificationIds={ignoredNotificationIds}
							referenceUrls={referenceUrls}
							updatingContainerId={updatingContainerId}
							updateError={updateError}
							onToggleHide={toggleHideContainer}
							onToggleIgnoreNotification={toggleIgnoreNotification}
							onSetConfirmUpdate={setConfirmUpdateState}
							onSaveReferenceUrl={handleSaveReferenceUrl}
						/>
					))}
				</AnimatePresence>
			</motion.div>

			<AnimatePresence>
				{filteredContainers.length === 0 && (
					<motion.div
						initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
						animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
						exit={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
						className='text-center py-20 text-muted-foreground'
					>
						{activeFilters.length === 0
							? dict.dashboard.selectCategory
							: debouncedQuery
								? dict.filter.noResults
								: dict.dashboard.noContainersFiltered}
					</motion.div>
				)}
			</AnimatePresence>

			<UpdateConfirmDialog
				confirmState={confirmUpdateState}
				onClose={() => setConfirmUpdateState(null)}
				onConfirm={handleUpdateClick}
				dict={dict}
			/>
		</>
	)
}
