'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink } from 'lucide-react'
import { StatsSummary, type FilterStatus } from './stats-summary'

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
	currentVersion: string
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

export function ContainerDashboard({
	processedContainers,
	stats
}: ContainerDashboardProps) {
	const [activeFilters, setActiveFilters] = useState<FilterStatus[]>([
		'updated',
		'available',
		'unknown'
	])

	const toggleFilter = (status: FilterStatus) => {
		setActiveFilters((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status]
		)
	}

	const filteredContainers = processedContainers.filter((item) =>
		activeFilters.includes(item.updateStatus)
	)

	return (
		<>
			<StatsSummary
				updatedCount={stats.updated}
				availableCount={stats.available}
				unknownCount={stats.unknown}
				activeFilters={activeFilters}
				onToggleFilter={toggleFilter}
			/>

			<div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
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
					let updateStatusNode = <span className='text-neutral-500'>Unknown</span>

					if (updateStatus === 'updated') {
						updateStatusNode = (
							<div className='flex flex-col items-end'>
								<span className='text-green-500 font-medium'>Actualizado</span>
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
									<span className='text-[10px] text-neutral-500'>
										Actualizado: {remoteDate}
									</span>
								</div>
							</div>
						)
					}

					return (
						<Card
							key={container.Id}
							className={`bg-neutral-900 border-neutral-800 text-neutral-50 transition-all duration-300 ${hasUpdateAvailable ? 'border-l-amber-500' : ''}`}
						>
							<CardHeader className='pb-2'>
								<div className='flex justify-between items-start'>
									<CardTitle className='text-lg font-medium text-white max-w-[260px]'>
										{containerName}
									</CardTitle>
									<Badge
										variant='outline'
										className={
											isRunning
												? 'bg-transparent text-green-500 border-green-500 font-mono rounded-[3.5px] cursor-default'
												: 'bg-transparent text-red-500 border-red-500 font-mono rounded-[3.5px] cursor-default'
										}
									>
										{container.State}
									</Badge>
								</div>
								<CardDescription className='text-neutral-400 truncate'>
									{container.Image}
									{currentVersion && currentVersion !== 'Unknown' && (
										<span className='ml-2 text-xs text-neutral-500 font-mono'>
											({currentVersion})
										</span>
									)}
								</CardDescription>
								<div className='text-xs text-neutral-500 font-mono mt-1'>
									ID: {container.ImageID.substring(7, 19)}...
								</div>
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
										<span className='text-neutral-500'>Ports:</span>
										<span className='font-mono truncate max-w-[150px]'>
											{ports || 'N/A'}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-neutral-500'>Status:</span>
										<span>{container.Status}</span>
									</div>
									<div className='flex justify-between items-start pt-2 border-t border-neutral-800 mt-2'>
										<div className='flex flex-col'>
											<span className='text-neutral-500 pt-0.5'>Imagen:</span>
											{currentVersion && currentVersion !== 'Unknown' && (
												<span className='text-[10px] text-neutral-400 font-mono'>
													{currentVersion}
												</span>
											)}
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
					)
				})}
			</div>

			{filteredContainers.length === 0 && (
				<div className='text-center py-20 text-neutral-500 animate-in fade-in duration-500'>
					{activeFilters.length === 0 
						? 'Selecciona una categoría arriba para filtrar los contenedores.'
						: 'No se encontraron contenedores para los filtros seleccionados.'}
				</div>
			)}
		</>
	)
}
