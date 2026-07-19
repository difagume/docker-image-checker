'use client'

import NumberFlow from '@number-flow/react'
import { ArrowUp, Check, Eye, EyeOff, HelpCircle } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import type { FilterStatus } from '@/types/app-state'

interface StatsSummaryProps {
	updatedCount: number
	availableCount: number
	unknownCount: number
	activeFilters: FilterStatus[]
	onToggleFilter: (status: FilterStatus) => void
	showHiddenMode: boolean
	onToggleShowHidden: () => void
	dict: Dictionary['stats']
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
				aria-pressed={isFilterActive('updated')}
				className={`flex items-center justify-between p-3 rounded-md border transition-[opacity,filter,background-color,border-color,box-shadow,ring-color] cursor-pointer text-left group
          ${
						isFilterActive('updated')
							? 'bg-muted border-green-500/50 ring-1 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
							: 'bg-muted/40 border-border/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-muted/60'
					}`}
			>
				<div className='flex items-center gap-3'>
					<div className='bg-green-950/30 text-green-500 p-2 rounded-md border border-green-500/20 shrink-0'>
						<Check className='h-4 w-4' strokeWidth={3} aria-hidden='true' />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('updated') ? 'text-foreground' : 'text-muted-foreground'}`}
					>
						<NumberFlow value={updatedCount} />{' '}
						{updatedCount === 1 ? dict.updatedImage : dict.updatedImages}
					</span>
				</div>
				<div
					className={`transition-colors duration-300 ${isFilterActive('updated') ? 'text-green-500' : 'text-muted-foreground group-hover:text-foreground'}`}
				>
					{isFilterActive('updated') ? (
<Eye className='h-4 w-4' aria-hidden='true' />
		) : (
			<EyeOff className='h-4 w-4' aria-hidden='true' />
		)}
	</div>
</button>

{/* Available Card with Gradient */}
			<button
				type='button'
				onClick={() => onToggleFilter('available')}
				aria-pressed={isFilterActive('available')}
				className={`relative overflow-hidden flex items-center justify-between p-3 rounded-md border transition-[opacity,filter,background-color,border-color,box-shadow,ring-color] cursor-pointer text-left group
          ${
						isFilterActive('available')
							? 'bg-muted border-amber-500/50 ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
							: 'bg-muted/40 border-border/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-muted/60'
					}`}
			>
				{isFilterActive('available') && (
					<div className='absolute inset-0 bg-linear-to-tr from-amber-500/10 via-amber-500/5 to-transparent opacity-80 pointer-events-none' />
				)}
				<div className='flex items-center gap-3 relative z-10'>
					<div className='bg-amber-950/40 text-amber-500 p-2 rounded-md border border-amber-500/20 shrink-0'>
						<ArrowUp className='h-4 w-4' strokeWidth={3} aria-hidden='true' />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('available') ? 'text-amber-400' : 'text-muted-foreground'}`}
					>
						<NumberFlow value={availableCount} />{' '}
						{availableCount === 1
							? dict.updateAvailable
							: dict.updatesAvailable}
					</span>
				</div>
				<div
					className={`relative z-10 transition-colors duration-300 ${isFilterActive('available') ? 'text-amber-500' : 'text-muted-foreground group-hover:text-foreground'}`}
				>
					{isFilterActive('available') ? (
						<Eye className='h-4 w-4' aria-hidden='true' />
					) : (
						<EyeOff className='h-4 w-4' aria-hidden='true' />
					)}
				</div>
			</button>

			{/* Unknown Card */}
			<button
				type='button'
				onClick={() => onToggleFilter('unknown')}
				aria-pressed={isFilterActive('unknown')}
				className={`flex items-center justify-between p-3 rounded-md border transition-[opacity,filter,background-color,border-color,box-shadow,ring-color] cursor-pointer text-left group
          ${
						isFilterActive('unknown')
							? 'bg-muted border-muted-foreground/50 ring-1 ring-muted-foreground/20 shadow-[0_0_15px_rgba(115,115,115,0.1)]'
							: 'bg-muted/40 border-border/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-muted/60'
					}`}
			>
				<div className='flex items-center gap-3'>
					<div className='bg-muted text-muted-foreground p-2 rounded-md border border-border/50 shrink-0'>
						<HelpCircle className='h-4 w-4' strokeWidth={3} aria-hidden='true' />
					</div>
					<span
						className={`font-semibold text-sm ${isFilterActive('unknown') ? 'text-foreground' : 'text-muted-foreground'}`}
					>
						<NumberFlow value={unknownCount} />{' '}
						{unknownCount === 1 ? dict.unknownImage : dict.unknownImages}
					</span>
				</div>
				<div
					className={`transition-colors duration-300 ${isFilterActive('unknown') ? 'text-muted-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}
				>
					{isFilterActive('unknown') ? (
						<Eye className='h-4 w-4' aria-hidden='true' />
					) : (
						<EyeOff className='h-4 w-4' aria-hidden='true' />
					)}
				</div>
			</button>

			<div className='md:col-span-3 flex justify-end -mt-2'>
				<button
					type='button'
					onClick={onToggleShowHidden}
					aria-pressed={showHiddenMode}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
						showHiddenMode
							? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
							: 'text-muted-foreground hover:text-foreground border border-transparent'
					}`}
					title={
						showHiddenMode
							? dict.hideMarkedContainers
							: dict.viewHiddenContainers
					}
				>
					{showHiddenMode ? (
						<Eye className='h-3.5 w-3.5' aria-hidden='true' />
					) : (
						<EyeOff className='h-3.5 w-3.5' aria-hidden='true' />
					)}
					{showHiddenMode ? dict.viewingHidden : dict.hiddenManagement}
				</button>
			</div>
		</div>
	)
}
