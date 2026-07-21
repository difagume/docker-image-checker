'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { ContainerCard } from '@/components/container-card'
import { SearchBar } from '@/components/search-bar'
import { useDashboard } from '@/contexts/dashboard-context'
import type { ContainerData } from '@/hooks/use-container-updates'
import { useContainerUpdates } from '@/hooks/use-container-updates'
import { useDebounce } from '@/hooks/use-debounce'
import { useLanguageSync } from '@/hooks/use-language-sync'
import { useSettingsSync } from '@/hooks/use-settings-sync'
import type { DockerConnectionInfo } from '@/lib/docker-connection'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import type { FilterStatus } from '@/types/app-state'
import { StatsSummary } from './stats-summary'
import { UpdateConfirmDialog } from './update-confirm-dialog'

interface ContainerDashboardProps {
	processedContainers: ContainerData[]
	dict: Dictionary
	locale: Locale
	connectionInfo: DockerConnectionInfo
	initialActiveFilters?: FilterStatus[]
	initialShowHiddenMode?: boolean
}

export function ContainerDashboard({
	processedContainers,
	dict,
	locale,
	connectionInfo,
	initialActiveFilters = ['updated', 'available', 'unknown'],
	initialShowHiddenMode = false
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] =
		useState<FilterStatus[]>(initialActiveFilters)
	const [showHiddenMode, setShowHiddenMode] = useState(initialShowHiddenMode)
	const [searchQuery, setSearchQuery] = useState('')
	const [confirmUpdateState, setConfirmUpdateState] = useState<{
		containerId: string
		containerName: string
		containerImage: string
		containerVersion: string
		newVersion: string
		isRunning: boolean
	} | null>(null)

	const prefersReducedMotion = useReducedMotion()
	const debouncedQuery = useDebounce(searchQuery, 300)

	const {
		state: { hiddenContainerIds, notificationsEnabled },
		actions
	} = useDashboard()

	const {
		containers,
		updatingContainerId,
		updateError,
		updatePhases,
		handleUpdateClick
	} = useContainerUpdates(processedContainers, dict)

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

	const toggleFilter = (status: FilterStatus) => {
		setActiveFilters((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status]
		)
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
				connectionInfo={connectionInfo}
				dict={dict.stats}
			/>

			<SearchBar
				searchQuery={searchQuery}
				debouncedQuery={debouncedQuery}
				onSearchChange={setSearchQuery}
				onClear={() => {
					setSearchQuery('')
				}}
				filteredCount={filteredContainers.length}
				totalCount={containers.length}
				dict={dict.filter}
			/>

			<motion.div
				layout={!prefersReducedMotion}
				className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'
			>
				<AnimatePresence mode='popLayout'>
					{filteredContainers.map((item) => (
						<ContainerCard
							key={item.container.Id}
							item={item}
							dict={dict}
							locale={locale}
							updatingContainerId={updatingContainerId}
							updateError={updateError}
							updatePhase={updatePhases[item.container.Id] ?? null}
							onSetConfirmUpdate={setConfirmUpdateState}
							onSaveReferenceUrl={actions.saveReferenceUrl}
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
