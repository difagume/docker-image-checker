'use client'

import { saveAllContainersCacheAction } from '@/actions/container-cache'
import { checkImageUpdate } from '@/actions/docker'
import {
	getReferenceUrlsAction,
	saveReferenceUrlAction
} from '@/actions/reference-url'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import type { FilterStatus } from '@/types/app-state'
import { AnimatePresence, motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import {
	Activity,
	ArrowUpCircle,
	Bell,
	BellOff,
	Clock,
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
import { ReferenceUrlPopover } from './reference-url-popover'
import { StatsSummary } from './stats-summary'

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
	stats,
	dict,
	locale,
	notificationsEnabled = false,
	initialActiveFilters = ['updated', 'available', 'unknown'],
	initialShowHiddenMode = false
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] = useState<FilterStatus[]>(initialActiveFilters)
	const [hiddenContainerIds, setHiddenContainerIds] = useState<string[]>([])
	const [ignoredNotificationIds, setIgnoredNotificationIds] = useState<
		string[]
	>([])
	const [showHiddenMode, setShowHiddenMode] = useState(initialShowHiddenMode)
	const [searchQuery, setSearchQuery] = useState('')
	const [debouncedQuery, setDebouncedQuery] = useState('')
	const [placeholder, setPlaceholder] = useState(dict.filter.placeholder)
	const [referenceUrls, setReferenceUrls] = useState<
		Record<string, ReferenceUrlData>
	>({})

	const [containers, setContainers] =
		useState<ContainerData[]>(processedContainers)

	// Derive stats dynamically from containers state
	const dynamicStats = useMemo(() => {
		return {
			updated: containers.filter((c) => c.updateStatus === 'updated').length,
			available: containers.filter((c) => c.updateStatus === 'available').length,
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
		fetch('/api/notifications/hidden')
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.hiddenContainerIds)
					setHiddenContainerIds(data.hiddenContainerIds)
			})

		if (notificationsEnabled) {
			fetch('/api/notifications/ignored')
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => {
					if (data?.ignoredNotificationIds)
						setIgnoredNotificationIds(data.ignoredNotificationIds)
				})
		}

		// Load reference URLs
		getReferenceUrlsAction().then((urls) => setReferenceUrls(urls))
	}, [notificationsEnabled])

	// Progressive Background Fetch for container updates
	useEffect(() => {
		let isCancelled = false

		const fetchUpdates = async () => {
			const finalCache: ContainersCache = {}

			for (const containerData of processedContainers) {
				if (isCancelled) return

				const cacheKey = containerData.localDigest
					? `${containerData.container.Image}::${containerData.localDigest}`
					: null

				// Skip containers that are neither freshly checking nor stale
				if (
					containerData.updateStatus !== 'checking' &&
					!containerData.isStale
				) {
					// Add non-checked containers to final cache to preserve them
					if (
						cacheKey &&
						containerData.localDigest &&
						containerData.updateStatus !== 'local' &&
						containerData.updateStatus !== 'unknown'
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
					continue
				}

				try {
					const {
						hasUpdate,
						latestDigest,
						lastUpdated,
						currentVersion,
						latestVersion,
						dockerHubUrl,
						isLocal,
						policyResult
					} = await checkImageUpdate(
						containerData.container.Image,
						containerData.localDigest
					)

					const imageTag = containerData.container.Image.split(':')[1] || 'latest'
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

					setContainers((prev) => {
						const next = [...prev]
						const index = next.findIndex(
							(c) => c.container.Id === containerData.container.Id
						)
						if (index === -1) return prev

						next[index] = {
							...next[index],
							updateStatus,
							currentVersion,
							displayCurrentVersion: displayCurrentVersionStr,
							latestVersion,
							lastUpdated,
							dockerHubUrl,
							isUpToDate: !hasUpdate,
							policyState: policyResult?.state,
							isStale: false
						}

						return next
					})

					// Update our finalCache object for this specific container
					if (cacheKey && containerData.localDigest && updateStatus !== 'local') {
						finalCache[cacheKey] = {
							imageName: containerData.container.Image,
							localDigest: containerData.localDigest,
							updateStatus: updateStatus as
								| 'updated'
								| 'available'
								| 'unknown',
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
						`Failed to check update for ${containerData.container.Image}`,
						error
					)
					// On error, only change 'checking' containers to 'unknown';
					// keep stale containers with their cached value
					if (containerData.updateStatus === 'checking') {
						setContainers((prev) => {
							const next = [...prev]
							const index = next.findIndex(
								(c) => c.container.Id === containerData.container.Id
							)
							if (index !== -1) {
								next[index] = { ...next[index], updateStatus: 'unknown' }
							}
							return next
						})
					} else if (
						cacheKey &&
						containerData.localDigest
					) {
						// Keep previous cache on error if it was stale
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
			}

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

	// Handle responsive placeholder
	useEffect(() => {
		const handleResize = () => {
			if (window.innerWidth < 768) {
				setPlaceholder(dict.filter.placeholderMobile)
			} else {
				setPlaceholder(dict.filter.placeholder)
			}
		}

		// Initial check
		handleResize()

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [dict])


	// Sync dashboard settings with server
	useEffect(() => {
		fetch('/api/dashboard/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ activeFilters, showHiddenMode })
		}).catch((error) => {
			console.error('Failed to sync dashboard settings:', error)
		})
	}, [activeFilters, showHiddenMode])

	// Sync preferred language for notifications
	useEffect(() => {
		if (notificationsEnabled) {
			fetch('/api/notifications/language', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: locale })
			}).catch((error) => {
				console.warn('Failed to sync preferred language with server:', error)
			})
		}
	}, [locale, notificationsEnabled])

	const toggleHideContainer = (id: string) => {
		const newHiddenIds = hiddenContainerIds.includes(id)
			? hiddenContainerIds.filter((i) => i !== id)
			: [...hiddenContainerIds, id]

		setHiddenContainerIds(newHiddenIds)

		// Sync with server
		fetch('/api/notifications/hidden', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hiddenContainerIds: newHiddenIds })
		}).catch((error) => {
			console.error('Failed to sync hidden containers:', error)
		})
	}

	const toggleIgnoreNotification = (id: string) => {
		const newIgnoredIds = ignoredNotificationIds.includes(id)
			? ignoredNotificationIds.filter((i) => i !== id)
			: [...ignoredNotificationIds, id]

		setIgnoredNotificationIds(newIgnoredIds)

		// Sync with server
		fetch('/api/notifications/ignored', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ignoredNotificationIds: newIgnoredIds })
		}).catch((error) => {
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

			<div className='flex flex-col md:flex-row gap-4 items-center justify-between mb-8 md:mb-6'>
				<div className='relative w-full shadow-sm'>
					<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none' />
					<Input
						placeholder={placeholder}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						maxLength={70}
						className={`pl-10 bg-neutral-900 border-neutral-800 text-neutral-200 placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-700 h-11 md:h-10 transition-all hover:border-neutral-700 rounded-[3.5px] ${
							debouncedQuery ? 'pr-10 md:pr-48' : 'pr-10'
						}`}
					/>
					{debouncedQuery && (
						<span className='absolute right-9 top-1/2 -translate-y-1/2 text-xs text-neutral-500 font-medium hidden md:block pointer-events-none'>
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
							className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-300 transition-colors rounded-full hover:bg-neutral-800/50'
							aria-label={dict.filter?.clearFilter || 'Clear'}
						>
							<X className='h-4 w-4' />
						</button>
					)}
				</div>

				{debouncedQuery && (
					<div className='w-full md:hidden text-center'>
						<span className='text-sm text-neutral-500 font-medium'>
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

						const displayLatestVersion =
							latestVersion !== 'latest' && latestVersion !== 'Unknown'
								? latestVersion
								: 'latest'

						let updateStatusInfo = null

						if (updateStatus === 'updated') {
							updateStatusInfo = (
								<span className='text-green-500 font-medium'>
									{dict.container.updated}
								</span>
							)
						} else if (updateStatus === 'available') {
							updateStatusInfo = (
								<Alert
									className={`rounded-[3.5px] p-3 ${
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
													className='bg-neutral-800 border-neutral-700 text-neutral-200'
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
								<span className='text-neutral-500 font-medium'>
									{dict.container.unknown}
								</span>
							)
						} else if (updateStatus === 'checking') {
							updateStatusInfo = (
								<span className='text-neutral-400 font-medium flex items-center gap-1.5'>
									<Loader2 className='h-3.5 w-3.5 animate-spin' />
									{(dict.container as any).checking || 'Checking...'}
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
									className={`bg-neutral-900 rounded-[3.5px] border-neutral-800 text-neutral-50 h-full transition-all duration-300 overflow-hidden ${
										hasUpdateAvailable
											? isNewMajor
												? 'border-l-violet-500'
												: 'border-l-amber-500'
											: ''
									} ${hiddenContainerIds.includes(container.Id) ? 'opacity-40 grayscale-[0.5] scale-[0.98]' : ''}`}
								>
									<CardHeader>
										<div className='flex justify-between items-start gap-4'>
											<CardTitle className='text-lg font-medium text-white wrap-anywhere break-normal flex items-start gap-2'>
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
															className={`transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500 rounded p-0.5 shrink-0 ${
																ignoredNotificationIds.includes(container.Id)
																	? 'text-neutral-600 hover:text-neutral-400'
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
														className={`transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500 rounded p-0.5 shrink-0 ${
															hiddenContainerIds.includes(container.Id)
																? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
																: 'text-neutral-600 hover:text-neutral-400'
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
														? 'bg-transparent text-green-500 border-green-500 rounded-[3.5px] cursor-default'
														: 'bg-transparent text-red-500 border-red-500 rounded-[3.5px] cursor-default'
												}`}
											>
												{dict.container.states[
													container.State.toLowerCase() as keyof typeof dict.container.states
												] || container.State}
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										<div className='space-y-2 text-sm text-neutral-300'>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-neutral-500'>
													<Fingerprint className='h-3 w-3' />
													<span className='font-medium text-xs'>
														{dict.container.containerId}
													</span>
												</div>
												<span className='text-xs text-neutral-400'>
													{container.Id.substring(0, 12)}
												</span>
											</div>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-neutral-500'>
													<Server className='h-3 w-3' />
													<span className='font-medium text-xs'>
														{dict.common.ports}
													</span>
												</div>
												<span className='text-xs text-neutral-400 truncate max-w-[150px]'>
													{ports || '---'}
												</span>
											</div>
											<div className='flex justify-between items-center'>
												<div className='flex items-center gap-1.5 text-neutral-500'>
													<Activity className='h-3 w-3' />
													<span className='font-medium text-xs'>
														{dict.common.status}
													</span>
												</div>
												<span className='text-xs text-neutral-400'>
													{container.Status}
												</span>
											</div>
											<div className='pt-2 border-t border-neutral-800 mt-2 space-y-2'>
												<div className='flex items-center justify-between'>
													<div className='flex items-center gap-2'>
														<Package className='h-4 w-4 text-neutral-500' />
														<span className='text-white font-bold text-sm'>
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
													<span className='text-xs text-neutral-400'>
														{container.ImageID.substring(7, 19)}
													</span>
												</div>

												<div className='space-y-1 pl-6 pt-1'>
													<div className='text-neutral-300 pb-1'>
														{container.Image.split(':')[0]}
													</div>
													<div className='flex items-center justify-between'>
														<span className='text-neutral-500 font-medium text-xs'>
															{dict.container.currentVersion}
														</span>
														<Badge
															variant='outline'
															className='bg-neutral-800/80 text-neutral-400 border-neutral-700/50 rounded-[3.5px] cursor-default max-w-[170px]'
														>
															<span className='truncate'>
																{displayCurrentVersion}
															</span>
														</Badge>
													</div>

													{hasUpdateAvailable && (
														<div className='flex items-center justify-between'>
															<span className='text-neutral-500 font-medium text-xs'>
																{isNewMajor
																	? dict.container.newMajorAvailable
																	: displayCurrentVersion ===
																			displayLatestVersion
																		? dict.container.newBuild
																		: dict.container.newVersion}
															</span>

															<Badge
																variant='outline'
																className={`bg-neutral-800/80 border-neutral-700/50 rounded-[3.5px] cursor-default max-w-[170px] ${
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
						className='text-center py-20 text-neutral-500'
					>
						{activeFilters.length === 0
							? dict.dashboard.selectCategory
							: debouncedQuery
								? dict.filter.noResults
								: dict.dashboard.noContainersFiltered}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
