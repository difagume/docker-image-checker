'use client'

import { ArrowUp, Check, Eye, EyeOff, HelpCircle } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'

export type FilterStatus = 'updated' | 'available' | 'unknown'

interface StatsSummaryProps {
	updatedCount: number
	availableCount: number
	unknownCount: number
	activeFilters: FilterStatus[]
	onToggleFilter: (status: FilterStatus) => void
	showHiddenMode: boolean
	onToggleShowHidden: () => void
	dict: Dictionary
}

export function StatsSummary({
	updatedCount,
	availableCount,
	unknownCount,
	activeFilters,
	onToggleFilter,
	showHiddenMode,
	onToggleShowHidden,
	dict
}: StatsSummaryProps) {
	const isFilterActive = (status: FilterStatus) =>
		activeFilters.includes(status)

	return (
		<div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
			{/* Updated Card */}
			<button
				type='button'
				onClick={() => onToggleFilter('updated')}
				className={`flex items-center justify-between p-3 rounded-[3.5px] border transition-all cursor-pointer text-left group
          ${
						isFilterActive('updated')
							? 'bg-neutral-800 border-green-500/50 ring-1 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				<div className='flex items-center gap-3'>
					<div className='bg-green-950/30 text-green-500 p-2 rounded-[3.5px] border border-green-500/20 shrink-0'>
						<Check className='h-4 w-4' strokeWidth={3} />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('updated') ? 'text-white' : 'text-neutral-400'}`}
					>
						{updatedCount}{' '}
						{updatedCount === 1
							? dict.stats.updatedImage
							: dict.stats.updatedImages}
					</span>
				</div>
				<div
					className={`transition-all duration-300 ${isFilterActive('updated') ? 'text-green-500' : 'text-neutral-600 group-hover:text-neutral-400'}`}
				>
					{isFilterActive('updated') ? (
						<Eye className='h-4 w-4' />
					) : (
						<EyeOff className='h-4 w-4' />
					)}
				</div>
			</button>

			{/* Available Card with Gradient */}
			<button
				type='button'
				onClick={() => onToggleFilter('available')}
				className={`relative overflow-hidden flex items-center justify-between p-3 rounded-[3.5px] border transition-all cursor-pointer text-left group
          ${
						isFilterActive('available')
							? 'bg-neutral-800 border-amber-500/50 ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				{isFilterActive('available') && (
					<div className='absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-amber-500/5 to-transparent opacity-80 pointer-events-none' />
				)}
				<div className='flex items-center gap-3 relative z-10'>
					<div className='bg-amber-950/40 text-amber-500 p-2 rounded-[3.5px] border border-amber-500/20 shrink-0'>
						<ArrowUp className='h-4 w-4' strokeWidth={3} />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('available') ? 'text-amber-400' : 'text-neutral-400'}`}
					>
						{availableCount}{' '}
						{availableCount === 1
							? dict.stats.updateAvailable
							: dict.stats.updatesAvailable}
					</span>
				</div>
				<div
					className={`relative z-10 transition-all duration-300 ${isFilterActive('available') ? 'text-amber-500' : 'text-neutral-600 group-hover:text-neutral-400'}`}
				>
					{isFilterActive('available') ? (
						<Eye className='h-4 w-4' />
					) : (
						<EyeOff className='h-4 w-4' />
					)}
				</div>
			</button>

			{/* Unknown Card */}
			<button
				type='button'
				onClick={() => onToggleFilter('unknown')}
				className={`flex items-center justify-between p-3 rounded-[3.5px] border transition-all cursor-pointer text-left group
          ${
						isFilterActive('unknown')
							? 'bg-neutral-800 border-neutral-500/50 ring-1 ring-neutral-500/20 shadow-[0_0_15px_rgba(115,115,115,0.1)]'
							: 'bg-neutral-900/40 border-neutral-800/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-neutral-900/60'
					}`}
			>
				<div className='flex items-center gap-3'>
					<div className='bg-neutral-800 text-neutral-400 p-2 rounded-[3.5px] border border-neutral-700/50 shrink-0'>
						<HelpCircle className='h-4 w-4' strokeWidth={3} />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('unknown') ? 'text-neutral-200' : 'text-neutral-500'}`}
					>
						{unknownCount}{' '}
						{unknownCount === 1
							? dict.stats.unknownImage
							: dict.stats.unknownImages}
					</span>
				</div>
				<div
					className={`transition-all duration-300 ${isFilterActive('unknown') ? 'text-neutral-400' : 'text-neutral-600 group-hover:text-neutral-400'}`}
				>
					{isFilterActive('unknown') ? (
						<Eye className='h-4 w-4' />
					) : (
						<EyeOff className='h-4 w-4' />
					)}
				</div>
			</button>

			<div className='md:col-span-3 flex justify-end -mt-2'>
				<button
					type='button'
					onClick={onToggleShowHidden}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-[3.5px] text-xs font-medium transition-all ${
						showHiddenMode
							? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
							: 'text-neutral-500 hover:text-neutral-400 border border-transparent'
					}`}
					title={
						showHiddenMode
							? dict.stats.hideMarkedContainers
							: dict.stats.viewHiddenContainers
					}
				>
					{showHiddenMode ? (
						<Eye className='h-3.5 w-3.5' />
					) : (
						<EyeOff className='h-3.5 w-3.5' />
					)}
					{showHiddenMode ? dict.stats.viewingHidden : dict.stats.hiddenManagement}
				</button>
			</div>
		</div>
	)
}
