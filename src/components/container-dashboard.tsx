'use client'

import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
	Activity,
	ArrowUpCircle,
	Bell,
	BellOff,
	Clock,
	Download,
	ExternalLink,
	Eye,
	EyeOff,
	Fingerprint,
	Loader2,
	Package,
	Search,
	Server,
	X,
	Zap
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
	getHiddenContainerIdsAction,
	getIgnoredNotificationContainerIdsAction,
	setDashboardSettingsAction,
	setHiddenContainerIdsAction,
	setIgnoredNotificationContainerIdsAction,
	setPreferredLanguageAction
} from '@/actions/app-state'
import {
	saveAllContainersCacheAction,
	updateContainerCacheAction
} from '@/actions/container-cache'
import {
	checkImagesUpdatesBatch,
	updateContainerImage,
	verifyContainerUpdate
} from '@/actions/docker'
import {
	getReferenceUrlsAction,
	saveReferenceUrlAction
} from '@/actions/reference-url'
import { dispatchLoading } from '@/components/loading-events'
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip'
import type { ContainersCache } from '@/lib/cache/containers'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import type { PolicyState } from '@/lib/policies/types'
import { cn } from '@/lib/utils'
import type { FilterStatus } from '@/types/app-state'
import { ReferenceUrlPopover } from './reference-url-popover'
import { StatsSummary } from './stats-summary'
import { UpdateConfirmDialog } from './update-confirm-dialog'

interface ReferenceUrlData {
	image: string
	referenceUrl: string
}

interface ContainerData {
	container: {
		Id: string
		State: string
		Image: string
		ImageID: string
		Status: string
		Names: string[]
	}
	isRunning: boolean
	ports: string
	updateStatus: FilterStatus | 'local'
	containerName: string
	currentVersion?: string
	displayCurrentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
	policyState?: PolicyState
	localDigest?: string
	/** true = loaded from cache, will refresh silently in the background */
	isStale?: boolean
}

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

const cardVariants = {
	initial: { opacity: 0, scale: 0.96, y: 10 },
	animate: { opacity: 1, scale: 1, y: 0 },
	exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }
}

function formatRelativeTime(date: Date, dict: Dictionary, locale: Locale) {
	const now = new Date()

	let years = now.getFullYear() - date.getFullYear()
	let months = now.getMonth() - date.getMonth()
	let days = now.getDate() - date.getDate()

	if (days < 0) {
		months -= 1
		const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
		days += prevMonth
	}
	if (months < 0) {
		years -= 1
		months += 12
	}

	const parts: string[] = []
	if (years > 0)
		parts.push(`${years} ${years === 1 ? dict.time.year : dict.time.years}`)
	if (months > 0)
		parts.push(`${months} ${months === 1 ? dict.time.month : dict.time.months}`)
	if (days > 0)
		parts.push(`${days} ${days === 1 ? dict.time.day : dict.time.days}`)

	if (parts.length > 0) {
		if (parts.length > 1) {
			const lastPart = parts.pop()
			if (locale === 'es') {
				return `${dict.time.ago} ${parts.join(', ')} y ${lastPart}`
			}
			if (locale === 'pt') {
				return `${dict.time.ago} ${parts.join(', ')} e ${lastPart}`
			}
			return `${parts.join(', ')} and ${lastPart} ${dict.time.ago}`
		}
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${parts[0]}`
		}
		return `${parts[0]} ${dict.time.ago}`
	}

	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
	if (diffInSeconds < 60) return dict.time.momentAgo

	const minutes = Math.floor(diffInSeconds / 60)
	if (minutes < 60) {
		const label = `${minutes} ${minutes === 1 ? dict.time.minute : dict.time.minutes}`
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${label}`
		}
		return `${label} ${dict.time.ago}`
	}

	const hours = Math.floor(minutes / 60)
	const label = `${hours} ${hours === 1 ? dict.time.hour : dict.time.hours}`
	if (locale === 'es' || locale === 'pt') {
		return `${dict.time.ago} ${label}`
	}
	return `${label} ${dict.time.ago}`
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
	const [lastSyncedSettings, setLastSyncedSettings] = useState<{
		activeFilters: FilterStatus[]
		showHiddenMode: boolean
	} | null>(null)
	const [lastSyncedLanguage, setLastSyncedLanguage] = useState<Locale | null>(
		null
	)

	const [containers, setContainers] =
		useState<ContainerData[]>(processedContainers)
	// Progreso de checks (barra superior comentada en el JSX; sigue usándose para RefreshButton)
	const [checkProgress, setCheckProgress] = useState<{
		current: number
		total: number
	}>({ current: 0, total: 0 })

	const [updatingContainerId, setUpdatingContainerId] = useState<string | null>(
		null
	)
	const [updateError, setUpdateError] = useState<string | null>(null)
	const [confirmUpdateState, setConfirmUpdateState] = useState<{
		containerId: string
		containerName: string
		containerImage: string
		containerVersion: string
		newVersion: string
		isRunning: boolean
	} | null>(null)

	// Sync loading state with event for the refresh button
	const isLoading = checkProgress.total > 0

	useEffect(() => {
		dispatchLoading(isLoading)
	}, [isLoading])

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

	// Sync containers state with props when they change (e.g. after a manual refresh)
	useEffect(() => {
		setContainers(processedContainers)
	}, [processedContainers])

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

	// Progressive Background Fetch for container updates
	useEffect(() => {
		let isCancelled = false

		const fetchUpdates = async () => {
			const finalCache: ContainersCache = {}

			// Collect containers that need checking
			const containersToCheck = processedContainers.filter(
				(containerData) =>
					containerData.updateStatus === 'checking' || containerData.isStale
			)
			const itemsToProcess = containersToCheck.length

			if (itemsToProcess > 0) {
				setCheckProgress({ current: 0, total: itemsToProcess })
			}

			// Build final cache for non-checking containers first
			for (const containerData of processedContainers) {
				const cacheKey = containerData.localDigest
					? `${containerData.container.Image}::${containerData.localDigest}`
					: null

				if (
					cacheKey &&
					containerData.localDigest &&
					containerData.updateStatus !== 'local' &&
					containerData.updateStatus !== 'unknown' &&
					containerData.updateStatus !== 'checking' &&
					!containerData.isStale
				) {
					finalCache[cacheKey] = {
						imageName: containerData.container.Image,
						localDigest: containerData.localDigest,
						updateStatus: containerData.updateStatus as
							| 'updated'
							| 'available'
							| 'unknown',
						currentVersion: containerData.currentVersion,
						displayCurrentVersion: containerData.displayCurrentVersion,
						latestVersion: containerData.latestVersion,
						lastUpdated: containerData.lastUpdated,
						dockerHubUrl: containerData.dockerHubUrl,
						isUpToDate: containerData.isUpToDate,
						policyState: containerData.policyState,
						cachedAt: new Date().toISOString()
					}
				}
			}

			// Fetch all updates in parallel with progress tracking
			let completed = 0
			const total = containersToCheck.length

			const updateResults = await checkImagesUpdatesBatch(
				containersToCheck.map((containerData) => ({
					containerId: containerData.container.Id,
					imageName: containerData.container.Image,
					localDigest: containerData.localDigest
				}))
			)

			for (const result of updateResults) {
				const containerData = containersToCheck.find(
					(item) => item.container.Id === result.containerId
				)
				if (!containerData) continue
				try {
					if (result.error) {
						throw new Error(result.error)
					}

					const {
						hasUpdate,
						latestDigest,
						lastUpdated,
						currentVersion,
						latestVersion,
						dockerHubUrl,
						isLocal,
						policyResult
					} = result

					const imageTag =
						containerData.container.Image.split(':')[1] || 'latest'
					const displayCurrentVersionStr =
						currentVersion && currentVersion !== 'Unknown'
							? currentVersion
							: imageTag

					let updateStatus: FilterStatus | 'local' = 'unknown'
					if (isLocal) {
						updateStatus = 'local'
					} else if (latestDigest) {
						updateStatus = hasUpdate ? 'available' : 'updated'
					}

					const cacheKey = containerData.localDigest
						? `${containerData.container.Image}::${containerData.localDigest}`
						: null

					if (
						cacheKey &&
						containerData.localDigest &&
						updateStatus !== 'local'
					) {
						finalCache[cacheKey] = {
							imageName: containerData.container.Image,
							localDigest: containerData.localDigest,
							updateStatus: updateStatus as 'updated' | 'available' | 'unknown',
							currentVersion,
							displayCurrentVersion: displayCurrentVersionStr,
							latestVersion,
							lastUpdated,
							dockerHubUrl,
							isUpToDate: !hasUpdate,
							policyState: policyResult?.state,
							cachedAt: new Date().toISOString()
						}
					}
				} catch (error) {
					console.error(
						`Failed to process update for ${containerData.container.Image}`,
						error
					)
				} finally {
					completed++
					if (!isCancelled && total > 0) {
						setCheckProgress({ current: completed, total })
					}
				}
			}

			const normalizedUpdateResults = updateResults.map((result) => {
				const containerData = containersToCheck.find(
					(item) => item.container.Id === result.containerId
				)
				if (!containerData) {
					return {
						containerId: result.containerId,
						error: result.error || 'Container not found'
					}
				}

				if (result.error) {
					return {
						containerId: result.containerId,
						error: result.error
					}
				}

				const imageTag = containerData.container.Image.split(':')[1] || 'latest'
				const displayCurrentVersionStr =
					result.currentVersion && result.currentVersion !== 'Unknown'
						? result.currentVersion
						: imageTag

				let updateStatus: FilterStatus | 'local' = 'unknown'
				if (result.isLocal) {
					updateStatus = 'local'
				} else if (result.latestDigest) {
					updateStatus = result.hasUpdate ? 'available' : 'updated'
				}

				return {
					containerId: result.containerId,
					updateStatus,
					currentVersion: result.currentVersion,
					displayCurrentVersion: displayCurrentVersionStr,
					latestVersion: result.latestVersion,
					lastUpdated: result.lastUpdated,
					dockerHubUrl: result.dockerHubUrl,
					isUpToDate: !result.hasUpdate,
					policyState: result.policyResult?.state,
					isStale: false,
					error: null
				}
			})

			const resultsByContainerId = new Map(
				normalizedUpdateResults
					.filter((result) => result?.containerId)
					.map((result) => [result.containerId, result] as const)
			)

			// Apply all updates in a single state update
			setContainers((prev) => {
				return prev.map((container) => {
					const result = resultsByContainerId.get(container.container.Id)

					if (!result) return container

					if (result.error) {
						// On error, only change 'checking' containers to 'unknown'
						if (container.updateStatus === 'checking') {
							return { ...container, updateStatus: 'unknown' as FilterStatus }
						}
						return container
					}

					return {
						...container,
						updateStatus: result.updateStatus as FilterStatus,
						currentVersion: result.currentVersion ?? container.currentVersion,
						displayCurrentVersion:
							result.displayCurrentVersion ?? container.displayCurrentVersion,
						latestVersion: result.latestVersion ?? container.latestVersion,
						lastUpdated: result.lastUpdated ?? container.lastUpdated,
						dockerHubUrl: result.dockerHubUrl ?? container.dockerHubUrl,
						isUpToDate: result.isUpToDate ?? container.isUpToDate,
						policyState: result.policyState ?? container.policyState,
						isStale: result.isStale ?? container.isStale
					}
				})
			})

			// All instances checked, save the cache back to the server
			if (!isCancelled && Object.keys(finalCache).length > 0) {
				try {
					await saveAllContainersCacheAction(finalCache)
					console.log(
						'[Cache] Successfully synchronized container cache to server'
					)
				} catch (error) {
					console.error(
						'[Cache] Failed to synchronize container cache to server',
						error
					)
				}
			}

			if (!isCancelled) {
				// Wait a bit so user sees 100%
				setTimeout(() => {
					if (!isCancelled) setCheckProgress({ current: 0, total: 0 })
				}, 1000)
			}
		}

		fetchUpdates()

		return () => {
			isCancelled = true
		}
	}, [processedContainers])

	// Debounce search query
	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedQuery(searchQuery)
		}, 400)
		return () => clearTimeout(handler)
	}, [searchQuery])

	// Sync dashboard settings with server
	// La sincronización ya está protegida por el debounce de 300ms
	// y el servidor es idempotente, así que no necesitamos la comparación
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setDashboardSettingsAction({ activeFilters, showHiddenMode })
				.then(() => setLastSyncedSettings({ activeFilters, showHiddenMode }))
				.catch((error) => {
					console.error('Failed to sync dashboard settings:', error)
				})
		}, 300)
		return () => clearTimeout(timeoutId)
	}, [activeFilters, showHiddenMode])

	// Sync preferred language for notifications
	useEffect(() => {
		if (notificationsEnabled) {
			if (lastSyncedLanguage === locale) return
			const timeoutId = setTimeout(() => {
				setPreferredLanguageAction(locale)
					.then(() => setLastSyncedLanguage(locale))
					.catch((error) => {
						console.warn(
							'Failed to sync preferred language with server:',
							error
						)
					})
			}, 300)

			return () => clearTimeout(timeoutId)
		}
	}, [locale, notificationsEnabled, lastSyncedLanguage])

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

	const handleUpdateClick = async (
		containerId: string,
		containerImage: string,
		newVersion: string
	) => {
		setUpdatingContainerId(containerId)
		setUpdateError(null)

		const imageName = containerImage.includes(':')
			? `${containerImage.split(':')[0]}:${newVersion}`
			: `${containerImage}:${newVersion}`

		const containerName =
			containers.find((c) => c.container.Id === containerId)?.containerName ||
			containerId.substring(0, 12)

		try {
			const result = await updateContainerImage(containerId, imageName)

			if (result.success) {
				// Verify if there's still an update available after the upgrade
				const updateInfo = await verifyContainerUpdate(imageName)

				// Determine update status based on verification result
				const newStatus = updateInfo.hasUpdate ? 'available' : 'updated'
				const latestVersion = updateInfo.latestVersion || newVersion

				// Use the new container ID if available (container was recreated)
				const updatedContainerId = result.newContainerId || containerId

				setContainers((prev) =>
					prev.map((c) =>
						c.container.Id === containerId
							? {
									...c,
									displayCurrentVersion: newVersion,
									currentVersion: newVersion,
									latestVersion: latestVersion,
									isUpToDate: !updateInfo.hasUpdate,
									updateStatus: newStatus as FilterStatus,
									dockerHubUrl: updateInfo.dockerHubUrl,
									policyState: updateInfo.policyState,
									container: {
										...c.container,
										Id: updatedContainerId,
										Image: imageName
									}
								}
							: c
					)
				)

				// Update the cache with the new container info
				if (updateInfo.localDigest) {
					updateContainerCacheAction(imageName, updateInfo.localDigest, {
						displayCurrentVersion: newVersion,
						currentVersion: newVersion,
						latestVersion: latestVersion,
						isUpToDate: !updateInfo.hasUpdate,
						updateStatus: newStatus,
						dockerHubUrl: updateInfo.dockerHubUrl,
						policyState: updateInfo.policyState,
						lastUpdated: new Date().toISOString()
					}).catch((err) => {
						console.error('[Cache] Failed to update container cache:', err)
					})
				}

				toast.success(
					dict.toast.updateSuccess
						.replace('{container}', containerName)
						.replace('{version}', newVersion)
				)
			} else {
				setUpdateError(result.error || 'Unknown error')
				setTimeout(() => setUpdateError(null), 5000)
				toast.error(
					dict.toast.updateError.replace('{container}', containerName)
				)
			}
		} catch (err) {
			setUpdateError(err instanceof Error ? err.message : 'Unknown error')
			setTimeout(() => setUpdateError(null), 5000)
			toast.error(dict.toast.updateError.replace('{container}', containerName))
		} finally {
			setUpdatingContainerId(null)
		}
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
			{/*
			 * Barra de progreso superior (UI desactivada): con `checkImagesUpdatesBatch` el
			 * cliente no recibe avances hasta terminar la petición, así que la barra no reflejaba
			 * bien el progreso. Se deja el código comentado para recuperarlo si en el futuro se
			 * vuelve a un flujo con actualizaciones por chunk o por contenedor.
			 * Nota: `checkProgress` / `setCheckProgress` siguen activos para `dispatchLoading`
			 * y el estado de carga del RefreshButton.
			 *
			 * <AnimatePresence>
			 *   {checkProgress.total > 0 && (
			 *     <motion.div
			 *       className='fixed top-0 left-0 right-0 z-100 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] origin-left'
			 *       initial={{ scaleX: 0 }}
			 *       animate={{ scaleX: checkProgress.current / checkProgress.total }}
			 *       exit={{ opacity: 0, transition: { duration: 0.5 } }}
			 *       transition={{ type: 'spring', stiffness: 50, damping: 20 }}
			 *     />
			 *   )}
			 * </AnimatePresence>
			 */}

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

			<div className='flex flex-col md:flex-row gap-4 items-center justify-between mb-8 md:mb-6'>
				<div className='relative w-full shadow-sm'>
					<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' />
				{/* Mobile input */}
				<Input
					placeholder={dict.filter.placeholderMobile}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					maxLength={70}
					className="pl-10 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring h-11 md:h-10 transition-all hover:border-border md:hidden"
				/>
				{/* Desktop input */}
				<Input
					placeholder={dict.filter.placeholder}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					maxLength={70}
					className="pl-10 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring h-11 md:h-10 transition-all hover:border-border hidden md:block"
				/>
					{debouncedQuery && (
						<span className='absolute right-9 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium hidden md:block pointer-events-none'>
							{dict.filter.showing.split('{count}')[0]}
							<NumberFlow value={filteredContainers.length} />
							{dict.filter.showing.split('{count}')[1].split('{total}')[0]}
							<NumberFlow value={containers.length} />
							{dict.filter.showing.split('{total}')[1]}
						</span>
					)}
					{searchQuery && (
						<button
							type='button'
							onClick={() => {
								setSearchQuery('')
								setDebouncedQuery('')
							}}
							className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted'
							aria-label={dict.filter.clearFilter}
						>
							<X className='h-4 w-4' />
						</button>
					)}
				</div>

				{debouncedQuery && (
					<div className='w-full md:hidden text-center'>
						<span className='text-sm text-muted-foreground font-medium'>
							{dict.filter.showing.split('{count}')[0]}
							<NumberFlow value={filteredContainers.length} />
							{dict.filter.showing.split('{count}')[1].split('{total}')[0]}
							<NumberFlow value={containers.length} />
							{dict.filter.showing.split('{total}')[1]}
						</span>
					</div>
				)}
			</div>

			<motion.div layout className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
				<AnimatePresence mode='popLayout'>
					{filteredContainers.map((item) => {
						const {
							container,
							isRunning,
							ports,
							updateStatus,
							containerName,
							displayCurrentVersion,
							latestVersion,
							lastUpdated,
							dockerHubUrl,
							policyState
						} = item

						const hasUpdateAvailable = updateStatus === 'available'
						const isNewMajor = policyState === 'NEW_MAJOR_VERSION_AVAILABLE'

						const displayLatestVersion: string =
							latestVersion !== 'latest' &&
							latestVersion !== 'Unknown' &&
							latestVersion !== undefined
								? latestVersion
								: 'latest'

						let updateStatusInfo = null

						if (updateStatus === 'updated') {
							updateStatusInfo = (
								<span className='text-primary font-medium'>
									{dict.container.updated}
								</span>
							)
						} else if (updateStatus === 'available') {
							updateStatusInfo = (
								<Alert
									className={`p-3 ${
										isNewMajor
											? 'bg-violet-500/10 border-violet-500/50 text-violet-300'
											: 'bg-amber-500/10 border-amber-500/50 text-amber-200'
									}`}
								>
									{isNewMajor ? (
										<Zap className='h-4 w-4 text-violet-400!' />
									) : (
										<ArrowUpCircle className='h-4 w-4 text-amber-400!' />
									)}
									{dockerHubUrl ? (
										<a
											href={dockerHubUrl}
											target='_blank'
											rel='noopener noreferrer'
											className='hover:underline'
										>
											<AlertTitle
												className={`font-bold text-sm mb-0 flex items-center gap-1.5 ${
													isNewMajor ? 'text-violet-400' : 'text-amber-400'
												}`}
											>
												{isNewMajor
													? dict.container.newMajorAvailable
													: dict.container.updateAvailable}
												<ExternalLink className='h-3.5 w-3.5' />
											</AlertTitle>
										</a>
									) : (
										<AlertTitle
											className={`font-bold text-sm mb-0 ${
												isNewMajor ? 'text-violet-400' : 'text-amber-400'
											}`}
										>
											{isNewMajor
												? dict.container.newMajorAvailable
												: dict.container.updateAvailable}
										</AlertTitle>
									)}
									{lastUpdated && (
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<AlertDescription
														className={`flex items-center gap-1 hover:text-opacity-100 transition-colors cursor-help ${
															isNewMajor
																? 'text-violet-300/80'
																: 'text-amber-300/80'
														}`}
													>
														<Clock className='h-3 w-3' />
														<span className='text-xs'>
															{formatRelativeTime(
																new Date(lastUpdated),
																dict,
																locale
															)}
														</span>
													</AlertDescription>
												</TooltipTrigger>
												<TooltipContent
													side='left'
													className='bg-popover text-popover-foreground border-border'
												>
													<p>
														{new Date(lastUpdated).toLocaleString(
															locale === 'es'
																? 'es-ES'
																: locale === 'pt'
																	? 'pt-BR'
																	: 'en-US',
															{
																day: '2-digit',
																month: '2-digit',
																year: 'numeric',
																hour: '2-digit',
																minute: '2-digit'
															}
														)}
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
									<AlertAction className='w-full flex flex-col items-center pt-1 -ml-3 gap-2'>
										{updateError && updatingContainerId === container.Id ? (
											<span className='text-xs text-destructive text-center'>
												{updateError}
											</span>
										) : null}
										<Button
											size='xs'
											disabled={updatingContainerId === container.Id}
											onClick={() => {
												setConfirmUpdateState({
													containerId: container.Id,
													containerName,
													containerImage: container.Image,
													containerVersion: displayCurrentVersion,
													newVersion: displayLatestVersion,
													isRunning
												})
											}}
											className={cn(
												'transition-colors',
												isNewMajor
													? 'bg-transparent text-violet-400 border border-violet-500/50 hover:bg-violet-500/10'
													: 'bg-transparent text-amber-400 border border-amber-500/50 hover:bg-amber-500/10',
												updatingContainerId === container.Id ? 'opacity-50' : ''
											)}
										>
											{updatingContainerId === container.Id ? (
												<>
													<Loader2 className='mr-1 h-3 w-3 animate-spin' />
													{dict.container.updating}
												</>
											) : (
												<>
													<Download className='mr-1 h-3 w-3' />
													{dict.container.update}
												</>
											)}
										</Button>
									</AlertAction>
								</Alert>
							)
						} else if (updateStatus === 'local') {
							updateStatusInfo = (
								<span className='text-blue-500/70 font-medium'>
									{dict.container.local}
								</span>
							)
						} else if (updateStatus === 'unknown') {
							updateStatusInfo = (
								<span className='text-muted-foreground font-medium'>
									{dict.container.unknown}
								</span>
							)
						} else if (updateStatus === 'checking') {
							const checkingLabel = dict.container.checking
							updateStatusInfo = (
								<span className='text-muted-foreground font-medium flex items-center gap-1.5'>
									<Loader2 className='h-3.5 w-3.5 animate-spin' />
									{checkingLabel}
								</span>
							)
						}

						return (
							<motion.div
								key={container.Id}
								layout
								variants={cardVariants}
								initial='initial'
								animate='animate'
								exit='exit'
								transition={{ duration: 0.25, ease: 'easeOut' }}
								className='min-w-0'
							>
								<Card
									className={`bg-card border-border text-card-foreground h-full transition-all duration-300 overflow-hidden ${
										hasUpdateAvailable
											? isNewMajor
												? 'border-l-violet-500'
												: 'border-l-amber-500'
											: ''
									} ${hiddenContainerIds.includes(container.Id) ? 'opacity-40 grayscale-[0.5] scale-[0.98]' : ''}`}
								>
									<CardHeader>
										<div className='flex justify-between items-start gap-4'>
											<CardTitle className='text-lg font-semibold tracking-tight text-foreground wrap-anywhere break-normal flex items-start gap-2'>
												<span className='flex-1 line-clamp-3'>
													{containerName}
												</span>
												<div className='flex items-center gap-1 mt-1'>
													{notificationsEnabled && (
														<button
															type='button'
															onClick={() =>
																toggleIgnoreNotification(container.Id)
															}
															className={`transition-colors focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 shrink-0 ${
																ignoredNotificationIds.includes(container.Id)
																	? 'text-muted-foreground hover:text-foreground'
																	: 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20'
															}`}
															title={
																ignoredNotificationIds.includes(container.Id)
																	? dict.container.enableNotifications
																	: dict.container.disableNotifications
															}
														>
															{ignoredNotificationIds.includes(container.Id) ? (
																<BellOff className='h-3.5 w-3.5' />
															) : (
																<Bell className='h-3.5 w-3.5' />
															)}
														</button>
													)}
													<button
														type='button'
														onClick={() => toggleHideContainer(container.Id)}
														className={`transition-colors focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 shrink-0 ${
															hiddenContainerIds.includes(container.Id)
																? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
																: 'text-muted-foreground hover:text-foreground'
														}`}
														title={
															hiddenContainerIds.includes(container.Id)
																? dict.container.showContainer
																: dict.container.hideContainer
														}
													>
														{hiddenContainerIds.includes(container.Id) ? (
															<Eye className='h-3.5 w-3.5' />
														) : (
															<EyeOff className='h-3.5 w-3.5' />
														)}
													</button>
												</div>
											</CardTitle>
											<Badge
												variant='outline'
												className={`shrink-0 ${
													isRunning
														? 'bg-transparent text-green-500 border-green-500 rounded-md cursor-default'
														: 'bg-transparent text-red-500 border-red-500 rounded-md cursor-default'
												}`}
											>
												{dict.container.states[
													container.State.toLowerCase() as keyof typeof dict.container.states
												] || container.State}
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										<div className='space-y-2 text-sm text-foreground'>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-muted-foreground'>
													<Fingerprint className='h-3 w-3' />
													<span className='font-semibold tracking-wider text-[11px]'>
														{dict.container.containerId}
													</span>
												</div>
												<span className='text-xs text-muted-foreground'>
													{container.Id.substring(0, 12)}
												</span>
											</div>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-muted-foreground'>
													<Server className='h-3 w-3' />
													<span className='font-semibold tracking-wider text-[11px]'>
														{dict.common.ports}
													</span>
												</div>
												<span className='text-xs text-muted-foreground truncate max-w-37.5'>
													{ports || '---'}
												</span>
											</div>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-muted-foreground'>
													<Activity className='h-3 w-3' />
													<span className='font-semibold tracking-wider text-[11px]'>
														{dict.common.status}
													</span>
												</div>
												<span className='text-xs text-muted-foreground'>
													{container.Status}
												</span>
											</div>
											<div className='pt-2 border-t border-border mt-2 space-y-2'>
												<div className='flex items-center justify-between'>
													<div className='flex items-center gap-2'>
														<Package className='h-4 w-4 text-muted-foreground' />
														<span className='text-foreground font-bold text-sm'>
															{dict.container.image}:
														</span>
														<ReferenceUrlPopover
															imageName={container.Image.split(':')[0]}
															currentUrl={
																referenceUrls[container.Image.split(':')[0]]
																	?.referenceUrl
															}
															onSave={(url: string) => {
																const imgName = container.Image.split(':')[0]
																setReferenceUrls(
																	(prev: Record<string, ReferenceUrlData>) => ({
																		...prev,
																		[imgName]: {
																			image: imgName,
																			referenceUrl: url
																		}
																	})
																)
																saveReferenceUrlAction(imgName, url)
															}}
															dict={dict.container}
														/>
													</div>
													<span className='text-xs text-muted-foreground'>
														{container.ImageID.substring(7, 19)}
													</span>
												</div>

												<div className='space-y-1 pl-6 pt-1'>
													<div className='text-foreground pb-1'>
														{container.Image.split(':')[0]}
													</div>
													<div className='flex items-center justify-between'>
														<span className='text-muted-foreground font-semibold tracking-wider text-[11px]'>
															{dict.container.currentVersion}
														</span>
														<Badge
															variant='outline'
															className='bg-muted text-muted-foreground border-border rounded-md cursor-default max-w-[170px]'
														>
															<span className='truncate'>
																{displayCurrentVersion}
															</span>
														</Badge>
													</div>

													{hasUpdateAvailable && (
														<div className='flex items-center justify-between'>
															<span className='text-muted-foreground font-semibold tracking-wider text-[11px]'>
																{isNewMajor
																	? dict.container.newMajorAvailable
																	: displayCurrentVersion ===
																			displayLatestVersion
																		? dict.container.newBuild
																		: dict.container.newVersion}
															</span>

															<Badge
																variant='outline'
																className={`bg-muted border-border rounded-md cursor-default max-w-[170px] ${
																	isNewMajor
																		? 'text-violet-500'
																		: 'text-amber-500'
																}`}
															>
																<span className='truncate'>
																	{displayLatestVersion}
																</span>
															</Badge>
														</div>
													)}
												</div>

												<div className='flex justify-end pt-1'>
													{updateStatusInfo}
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							</motion.div>
						)
					})}
				</AnimatePresence>
			</motion.div>

			<AnimatePresence>
				{filteredContainers.length === 0 && (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 10 }}
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
