'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
	Activity,
	ArrowUpCircle,
	Clock,
	ExternalLink,
	Eye,
	EyeOff,
	Fingerprint,
	Package,
	Search,
	Server,
	X
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import { type FilterStatus, StatsSummary } from './stats-summary'

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
	displayCurentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
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
	locale
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] = useState<FilterStatus[]>([
		'updated',
		'available',
		'unknown'
	])
	const [hiddenContainerIds, setHiddenContainerIds] = useState<string[]>([])
	const [showHiddenMode, setShowHiddenMode] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')
	const [debouncedQuery, setDebouncedQuery] = useState('')
	const [placeholder, setPlaceholder] = useState(dict.filter.placeholder)

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

	// Load settings
	useEffect(() => {
		// Load hidden containers from server
		fetch('/api/notifications/hidden')
			.then((res) => {
				// Ignore unauthorized (e.g. login page handles redirection if needed,
				// but dashboard might be visible in public mode if configured)
				// If 401, we just don't load hidden containers (empty list)
				if (res.status === 401) return null
				if (res.ok) return res.json()
				throw new Error('Failed to fetch hidden containers')
			})
			.then((data) => {
				if (data?.hiddenContainerIds) {
					setHiddenContainerIds(data.hiddenContainerIds)
				}
			})
			.catch((error) => {
				console.warn('Failed to load hidden containers:', error)
			})

		// Load filters from localStorage
		try {
			const savedFilters = localStorage.getItem('activeFilters')
			if (savedFilters) {
				setActiveFilters(JSON.parse(savedFilters))
			}
		} catch (_error) {
			console.warn('LocalStorage is not available or restricted:', _error)
		}
	}, [])

	useEffect(() => {
		try {
			localStorage.setItem('activeFilters', JSON.stringify(activeFilters))
		} catch {
			// Silent fail if localStorage is not available
		}
	}, [activeFilters])

	// Sync preferred language for notifications
	useEffect(() => {
		fetch('/api/notifications/language', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ language: locale })
		}).catch((error) => {
			console.warn('Failed to sync preferred language with server:', error)
		})
	}, [locale])

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
			// Revert on error?
			// For now we keep optimistic UI update
		})
	}

	const toggleFilter = (status: FilterStatus) => {
		setActiveFilters((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status]
		)
	}

	const filteredContainers = processedContainers.filter((item) => {
		// Treat 'local' as 'unknown' for filtering purposes
		const statusForFilter =
			item.updateStatus === 'local' ? 'unknown' : item.updateStatus
		const isStatusMatch = activeFilters.includes(statusForFilter)
		const isHidden = hiddenContainerIds.includes(item.container.Id)

		// Text Search Filtering
		let isTextMatch = true
		if (debouncedQuery) {
			const q = debouncedQuery.toLowerCase()
			const nameMatch = item.containerName.toLowerCase().includes(q)
			const imageMatch = item.container.Image.toLowerCase().includes(q)
			// Check versions/tags
			const currentVerMatch = item.displayCurentVersion
				?.toLowerCase()
				.includes(q)
			const latestVerMatch =
				item.latestVersion?.toLowerCase().includes(q) || false

			isTextMatch = nameMatch || imageMatch || currentVerMatch || latestVerMatch
		}

		if (showHiddenMode) {
			// In management mode, we show everything that matches the status filter
			// or we could show only hidden ones. Let's show everything but highlighted.
			return isStatusMatch && isTextMatch
		}

		// In normal mode, exclude hidden containers
		return isStatusMatch && !isHidden && isTextMatch
	})

	return (
		<>
			<StatsSummary
				updatedCount={stats.updated}
				availableCount={stats.available}
				unknownCount={stats.unknown}
				activeFilters={activeFilters}
				onToggleFilter={toggleFilter}
				showHiddenMode={showHiddenMode}
				onToggleShowHidden={() => setShowHiddenMode(!showHiddenMode)}
				dict={dict.stats}
			/>

			{/* Contextual Filter Bar */}
			<div className='flex flex-col md:flex-row gap-4 items-center justify-between mb-8 md:mb-6'>
				<div className='relative w-full shadow-sm'>
					<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none' />
					<Input
						placeholder={placeholder}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className={`pl-10 bg-neutral-900 border-neutral-800 text-neutral-200 placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-700 h-11 md:h-10 transition-all hover:border-neutral-700 rounded-[3.5px] ${
							debouncedQuery ? 'pr-10 md:pr-48' : 'pr-10'
						}`}
					/>
					{debouncedQuery && (
						<span className='absolute right-9 top-1/2 -translate-y-1/2 text-xs text-neutral-500 font-medium hidden md:block pointer-events-none'>
							{dict.filter.showing
								.replace('{count}', filteredContainers.length.toString())
								.replace('{total}', processedContainers.length.toString())}
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

				{/* Counter - Mobile only */}
				{debouncedQuery && (
					<div className='w-full md:hidden text-center'>
						<span className='text-sm text-neutral-500 font-medium'>
							{dict.filter.showing
								.replace('{count}', filteredContainers.length.toString())
								.replace('{total}', processedContainers.length.toString())}
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
							// currentVersion,
							displayCurentVersion,
							latestVersion,
							lastUpdated,
							dockerHubUrl
						} = item

						const hasUpdateAvailable = updateStatus === 'available'

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
								<Alert className='bg-amber-500/10 rounded-[3.5px] border-amber-500/50 text-amber-200 p-3'>
									<ArrowUpCircle className='h-4 w-4 !text-amber-400' />
									{dockerHubUrl ? (
										<a
											href={dockerHubUrl}
											target='_blank'
											rel='noopener noreferrer'
											className='hover:underline'
										>
											<AlertTitle className='text-amber-400 font-bold text-sm mb-0 flex items-center gap-1.5'>
												{dict.container.updateAvailable}
												<ExternalLink className='h-3.5 w-3.5' />
											</AlertTitle>
										</a>
									) : (
										<AlertTitle className='text-amber-400 font-bold text-sm mb-0'>
											{dict.container.updateAvailable}
										</AlertTitle>
									)}
									{lastUpdated && (
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<AlertDescription className='flex items-center gap-1 text-amber-300/80 hover:text-amber-300 transition-colors cursor-help'>
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
									className={`bg-neutral-900 rounded-[3.5px] border-neutral-800 text-neutral-50 h-full transition-all duration-300 overflow-hidden ${hasUpdateAvailable ? 'border-l-amber-500' : ''} ${hiddenContainerIds.includes(container.Id) ? 'opacity-40 grayscale-[0.5] scale-[0.98]' : ''}`}
								>
									<CardHeader>
										<div className='flex justify-between items-start gap-4'>
											<CardTitle className='text-lg font-medium text-white [overflow-wrap:anywhere] break-normal flex items-start gap-2'>
												<span className='flex-1 line-clamp-3'>
													{containerName}
												</span>
												<button
													type='button'
													onClick={() => toggleHideContainer(container.Id)}
													className={`transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500 rounded p-0.5 mt-1 shrink-0 ${
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
													</div>
													<span className='text-xs text-neutral-400'>
														{container.ImageID.substring(7, 19)}
													</span>
												</div>

												<div className='space-y-1 pl-6 pt-1'>
													<div
														className='text-neutral-300 pb-1'
														title={container.Image}
													>
														{container.Image.split(':')[0]}
														{/* <span className='text-neutral-500'>
															:{container.Image.split(':')[1] || 'latest'}
														</span> */}
													</div>
													<div className='flex items-center justify-between'>
														<span className='text-neutral-500 font-medium text-xs'>
															{dict.container.currentVersion}
														</span>
														<Badge
															variant='outline'
															className={
																'bg-neutral-800/80 text-neutral-400 border-neutral-700/50 rounded-[3.5px] cursor-default max-w-[170px]'
															}
															title={displayCurentVersion}
														>
															<span className='truncate'>
																{displayCurentVersion}
															</span>
														</Badge>
													</div>

													{hasUpdateAvailable && (
														<div className='flex items-center justify-between'>
															<span className='text-neutral-500 font-medium text-xs'>
																{dict.container.newVersion}
															</span>

															<Badge
																variant='outline'
																className={
																	'bg-neutral-800/80 text-amber-500 border-neutral-700/50 rounded-[3.5px] cursor-default max-w-[170px]'
																}
																title={displayLatestVersion}
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

											{/* <details className='mt-2 border-t border-neutral-800 pt-2'>
												<summary className='cursor-pointer text-xs text-neutral-500 hover:text-neutral-300'>
													{dict.container.debugJson}
												</summary>
												<pre className='text-[10px] bg-black p-2 rounded overflow-x-auto mt-1 max-h-40 text-neutral-400 w-full'>
													{JSON.stringify(container, null, 2)}
												</pre>
											</details> */}
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
