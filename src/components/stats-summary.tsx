'use client'

import { ArrowUp, Check, HelpCircle } from 'lucide-react'

export type FilterStatus = 'updated' | 'available' | 'unknown'

interface StatsSummaryProps {
	updatedCount: number
	availableCount: number
	unknownCount: number
	activeFilters: FilterStatus[]
	onToggleFilter: (status: FilterStatus) => void
}

export function StatsSummary({
	updatedCount,
	availableCount,
	unknownCount,
	activeFilters,
	onToggleFilter
}: StatsSummaryProps) {
	const isFilterActive = (status: FilterStatus) => activeFilters.includes(status)

	return (
		<div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
			{/* Updated Card */}
			<button
				type='button'
				onClick={() => onToggleFilter('updated')}
				className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer text-left
          ${
						isFilterActive('updated')
							? 'bg-neutral-800 border-green-500/50 ring-1 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				<div className='bg-green-950/30 text-green-500 p-2 rounded-md border border-green-500/20 shrink-0'>
					<Check className='h-4 w-4' strokeWidth={3} />
				</div>
				<span
					className={`font-semibold text-sm ${isFilterActive('updated') ? 'text-white' : 'text-neutral-400'}`}
				>
					{updatedCount}{' '}
					{updatedCount === 1 ? 'Imagen actualizada' : 'Imágenes actualizadas'}
				</span>
			</button>

			{/* Available Card with Gradient */}
			<button
				type='button'
				onClick={() => onToggleFilter('available')}
				className={`relative overflow-hidden flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer text-left
          ${
						isFilterActive('available')
							? 'bg-neutral-800 border-amber-500/50 ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				{isFilterActive('available') && (
					<div className='absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-amber-500/5 to-transparent opacity-80 pointer-events-none' />
				)}
				<div className='bg-amber-950/40 text-amber-500 p-2 rounded-md border border-amber-500/20 relative z-10 shrink-0'>
					<ArrowUp className='h-4 w-4' strokeWidth={3} />
				</div>
				<span
					className={`font-semibold text-sm relative z-10 ${isFilterActive('available') ? 'text-amber-100' : 'text-neutral-400'}`}
				>
					{availableCount}{' '}
					{availableCount === 1
						? 'Actualización disponible'
						: 'Actualizaciones disponibles'}
				</span>
			</button>

			{/* Unknown Card */}
			<button
				type='button'
				onClick={() => onToggleFilter('unknown')}
				className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer text-left
          ${
						isFilterActive('unknown')
							? 'bg-neutral-800 border-neutral-500/50 ring-1 ring-neutral-500/20 shadow-[0_0_15px_rgba(115,115,115,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				<div className='bg-neutral-800 text-neutral-400 p-2 rounded-md border border-neutral-700/50 shrink-0'>
					<HelpCircle className='h-4 w-4' strokeWidth={3} />
				</div>
				<span
					className={`font-semibold text-sm ${isFilterActive('unknown') ? 'text-neutral-200' : 'text-neutral-500'}`}
				>
					{unknownCount}{' '}
					{unknownCount === 1 ? 'Imagen desconocida' : 'Imágenes desconocidas'}
				</span>
			</button>
		</div>
	)
}
