'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
	Activity,
	Clock,
	ExternalLink,
	Eye,
	EyeOff,
	Package,
	Server
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip'
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
	updateStatus: FilterStatus
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
}

const cardVariants = {
	initial: { opacity: 0, scale: 0.96, y: 10 },
	animate: { opacity: 1, scale: 1, y: 0 },
	exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }
}

function formatRelativeTime(date: Date) {
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
	if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`)
	if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`)
	if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`)

	if (parts.length > 0) {
		if (parts.length > 1) {
			const lastPart = parts.pop()
			return `hace ${parts.join(', ')} y ${lastPart}`
		}
		return `hace ${parts[0]}`
	}

	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
	if (diffInSeconds < 60) return 'hace un momento'

	const minutes = Math.floor(diffInSeconds / 60)
	if (minutes < 60)
		return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`

	const hours = Math.floor(minutes / 60)
	return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
}

export function ContainerDashboard({
	processedContainers,
	stats
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] = useState<FilterStatus[]>([
		'updated',
		'available',
		'unknown'
	])
	const [hiddenContainerIds, setHiddenContainerIds] = useState<string[]>([])
	const [showHiddenMode, setShowHiddenMode] = useState(false)

	// Load hidden containers and filters from localStorage
	useEffect(() => {
		try {
			const savedHidden = localStorage.getItem('hiddenContainerIds')
			if (savedHidden) {
				setHiddenContainerIds(JSON.parse(savedHidden))
			}

			const savedFilters = localStorage.getItem('activeFilters')
			if (savedFilters) {
				setActiveFilters(JSON.parse(savedFilters))
			}
		} catch (e) {
			console.warn('LocalStorage is not available or restricted:', e)
		}
	}, [])

	// Save data to localStorage
	useEffect(() => {
		try {
			localStorage.setItem('hiddenContainerIds', JSON.stringify(hiddenContainerIds))
		} catch (e) {
			// Silent fail if localStorage is not available
		}
	}, [hiddenContainerIds])

	useEffect(() => {
		try {
			localStorage.setItem('activeFilters', JSON.stringify(activeFilters))
		} catch (e) {
			// Silent fail if localStorage is not available
		}
	}, [activeFilters])

	const toggleHideContainer = (id: string) => {
		setHiddenContainerIds((prev) =>
			prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
		)
	}

	const toggleFilter = (status: FilterStatus) => {
		setActiveFilters((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status]
		)
	}

	const filteredContainers = processedContainers.filter((item) => {
		const isStatusMatch = activeFilters.includes(item.updateStatus)
		const isHidden = hiddenContainerIds.includes(item.container.Id)

		if (showHiddenMode) {
			// In management mode, we show everything that matches the status filter
			// or we could show only hidden ones. Let's show everything but highlighted.
			return isStatusMatch
		}

		// In normal mode, exclude hidden containers
		return isStatusMatch && !isHidden
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
			/>

			<motion.div layout className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
				<AnimatePresence mode='popLayout'>
					{filteredContainers.map((item) => {
						const {
							container,
							isRunning,
							ports,
							updateStatus,
							containerName,
							currentVersion,
							displayCurentVersion,
							latestVersion,
							lastUpdated,
							dockerHubUrl
						} = item

						const hasUpdateAvailable = updateStatus === 'available'

						// Render status node dynamically in the client component
						let updateStatusNode = (
							<span className='text-neutral-500'>Unknown</span>
						)

						if (updateStatus === 'updated') {
							updateStatusNode = (
								<div className='flex flex-col items-end'>
									<span className='text-green-500 font-medium'>
										Actualizado
									</span>
									<span className='text-xs text-neutral-600'>
										{displayCurentVersion}
									</span>
								</div>
							)
						} else if (updateStatus === 'available') {
							const remoteDate = lastUpdated
								? new Date(lastUpdated).toLocaleDateString('es-ES')
								: 'N/A'
							const displayLatestVersion =
								latestVersion !== 'latest' && latestVersion !== 'Unknown'
									? latestVersion
									: 'latest'

							updateStatusNode = (
								<div className='flex flex-col items-end'>
									{dockerHubUrl ? (
										<a
											href={dockerHubUrl}
											target='_blank'
											rel='noopener noreferrer'
											className='text-amber-500 font-bold hover:underline hover:text-amber-400 flex items-center gap-1'
											title='Ver en Docker Hub'
										>
											Actualización disponible
											<ExternalLink className='h-4 w-4' />
										</a>
									) : (
										<span className='text-amber-500 font-bold'>
											Actualización disponible
										</span>
									)}
									<div className='flex flex-col text-right'>
										<span className='text-xs text-neutral-400'>
											Disponible: {displayLatestVersion}
										</span>
										{lastUpdated && (
											<div className='pt-2 border-t border-white/5 flex items-center justify-center gap-2'>
												<Clock className='h-3 w-3 text-neutral-500' />
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className='text-[10px] text-neutral-500 cursor-help border-b border-dotted border-neutral-700 pb-0.5 mt-1'>
																Publicada:{' '}
																{formatRelativeTime(new Date(lastUpdated))}
															</span>
														</TooltipTrigger>
														<TooltipContent
															side='left'
															className='bg-neutral-800 border-neutral-700 text-neutral-200'
														>
															<p>
																{new Date(lastUpdated).toLocaleString('es-ES', {
																	day: '2-digit',
																	month: '2-digit',
																	year: 'numeric',
																	hour: '2-digit',
																	minute: '2-digit'
																})}
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
										)}
									</div>
								</div>
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
							>
								<Card
									className={`bg-neutral-900 border-neutral-800 text-neutral-50 h-full transition-all duration-300 ${hasUpdateAvailable ? 'border-l-amber-500' : ''} ${hiddenContainerIds.includes(container.Id) ? 'opacity-40 grayscale-[0.5] scale-[0.98]' : ''}`}
								>
									<CardHeader className='pb-2'>
										<div className='flex justify-between items-start gap-4'>
											<CardTitle className='text-lg font-medium text-white [overflow-wrap:anywhere] break-normal flex items-start gap-2'>
												<span className='flex-1'>{containerName}</span>
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
															? 'Mostrar contenedor'
															: 'Ocultar contenedor'
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
														? 'bg-transparent text-green-500 border-green-500 font-mono rounded-[3.5px] cursor-default'
														: 'bg-transparent text-red-500 border-red-500 font-mono rounded-[3.5px] cursor-default'
												}`}
											>
												{container.State}
											</Badge>
										</div>
										<CardDescription className='text-neutral-200 truncate'>
											{container.Image.split(':')[0]}
											<span className='text-neutral-500'>
												:{container.Image.split(':')[1] || 'latest'}
											</span>
											{currentVersion && currentVersion !== 'Unknown' && (
												<span className='ml-2 text-xs text-neutral-500 font-mono'>
													({currentVersion})
												</span>
											)}
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className='space-y-2 text-sm text-neutral-300'>
											<div className='flex justify-between'>
												<span className='text-neutral-500'>ID:</span>
												<span className='font-mono'>
													{container.Id.substring(0, 12)}
												</span>
											</div>
											<div className='flex justify-between'>
												<div className='flex items-center gap-1.5 text-neutral-500'>
													<Server className='h-3 w-3' />
													<span>Ports:</span>
												</div>
												<span className='font-mono truncate max-w-[150px]'>
													{ports || '---'}
												</span>
											</div>
											<div className='flex justify-between'>
												<div className='flex items-center gap-1.5 text-neutral-500'>
													<Activity className='h-3 w-3' />
													<span className='text-neutral-500'>Status:</span>
												</div>
												<span>{container.Status}</span>
											</div>
											<div className='flex justify-between items-start pt-2 border-t border-neutral-800 mt-2'>
												<div className='flex flex-col'>
													<div className='flex items-center gap-2 mb-1'>
														<Package className='h-4 w-4 text-neutral-500' />
														<span className='text-neutral-500 pt-0.5'>
															Imagen:
														</span>
													</div>
													{currentVersion && currentVersion !== 'Unknown' && (
														<span className='text-[10px] text-neutral-400 font-mono'>
															{currentVersion}
														</span>
													)}
													{/* <div className='text-[10px] text-neutral-500 font-mono'>
														ID: {container.ImageID.substring(7, 19)}...
													</div> */}
												</div>
												{updateStatusNode}
											</div>

											<details className='mt-2 border-t border-neutral-800 pt-2'>
												<summary className='cursor-pointer text-xs text-neutral-500 hover:text-neutral-300'>
													Depurar JSON
												</summary>
												<pre className='text-[10px] bg-black p-2 rounded overflow-auto mt-1 max-h-40 font-mono text-neutral-400'>
													{JSON.stringify(container, null, 2)}
												</pre>
											</details>
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
							? 'Selecciona una categoría arriba para filtrar los contenedores.'
							: 'No se encontraron contenedores para los filtros seleccionados.'}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
