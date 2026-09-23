'use client'

import NumberFlow from '@number-flow/react'
import type { LucideIcon } from 'lucide-react'
import {
	ArrowUp,
	Check,
	Eye,
	EyeOff,
	HelpCircle,
	ToggleLeft,
	ToggleRight
} from 'lucide-react'
import { HostInfoIndicator } from '@/components/host-info-indicator'
import { RemoteConnectionIndicator } from '@/components/remote-connection-indicator'
import type { DockerConnectionInfo } from '@/lib/docker'
import type { DockerHostInfo } from '@/lib/docker-inventory'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import type { FilterStatus } from '@/types/app-state'

/** Visible/hidden split for one stat bucket (no boolean-prop proliferation). */
export interface StatCounts {
	visible: number
	hidden: number
	total: number
}

function hiddenSubline(counts: StatCounts, locale: Locale): string {
	if (locale === 'en') return `+${counts.hidden} hidden · ${counts.total} total`
	if (locale === 'pt')
		return `+${counts.hidden} ocultos · ${counts.total} total`
	return `+${counts.hidden} ocultas · ${counts.total} total`
}

function countsBreakdown(counts: StatCounts, locale: Locale): string {
	if (locale === 'en')
		return `${counts.visible} visible, ${counts.hidden} hidden, ${counts.total} total`
	if (locale === 'pt')
		return `${counts.visible} visíveis, ${counts.hidden} ocultos, ${counts.total} no total`
	return `${counts.visible} visibles, ${counts.hidden} ocultas, ${counts.total} en total`
}

interface StatFilterCardProps {
	status: FilterStatus
	counts: StatCounts
	isActive: boolean
	onToggle: () => void
	icon: LucideIcon
	label: string
	/** Tailwind classes for the card active state */
	activeCardClass: string
	/** Tailwind classes for the icon container active state */
	activeIconClass: string
	/** Tailwind classes for the text label active state (defaults to text-foreground) */
	activeTextClass?: string
	/** Tailwind classes for the toggle indicator active state (defaults to matching the border color) */
	activeIndicatorClass?: string
	/** Accessible verb used when the filter is inactive (e.g. "Filter by") */
	filterApplyLabel: string
	/** Accessible verb used when the filter is active (e.g. "Remove filter for") */
	filterRemoveLabel: string
	/** Show gradient overlay when active */
	gradient?: boolean
	/** When true the big number shows the total instead of the visible count */
	showHiddenMode: boolean
	/** Activates the hidden-containers view without touching the status filter */
	onToggleShowHidden: () => void
	/** Tooltip/accessible name for the hidden-counts subline */
	viewHiddenTitle: string
	locale: Locale
}

function StatFilterCard({
	counts,
	isActive,
	onToggle,
	icon: Icon,
	label,
	activeCardClass,
	activeIconClass,
	activeTextClass = 'text-foreground',
	activeIndicatorClass = 'text-muted-foreground',
	filterApplyLabel,
	filterRemoveLabel,
	gradient,
	showHiddenMode,
	onToggleShowHidden,
	viewHiddenTitle,
	locale
}: StatFilterCardProps) {
	const displayCount = showHiddenMode ? counts.total : counts.visible
	const breakdown = countsBreakdown(counts, locale)
	const actionLabel = `${isActive ? filterRemoveLabel : filterApplyLabel} ${label}`
	return (
		<div
			className={`relative overflow-hidden p-3 rounded-sm border transition-[opacity,filter,background-color,border-color,box-shadow,ring-color] group
				${
					isActive
						? activeCardClass
						: 'bg-muted/40 border-border/60 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:bg-muted/60'
				}`}
		>
			{gradient && isActive && (
				<div className='absolute inset-0 bg-linear-to-tr from-amber-500/10 via-amber-500/5 to-transparent opacity-80 pointer-events-none' />
			)}
			<button
				type='button'
				onClick={onToggle}
				aria-pressed={isActive}
				title={actionLabel}
				aria-label={`${actionLabel}: ${breakdown}`}
				className='relative z-10 flex w-full items-center justify-between gap-3 cursor-pointer text-left'
			>
				<span className='flex items-center gap-3'>
					<span
						className={`p-2 rounded-sm border shrink-0 ${
							isActive
								? activeIconClass
								: 'bg-muted text-muted-foreground border-border/50'
						}`}
					>
						<Icon className='h-4 w-4' strokeWidth={3} aria-hidden='true' />
					</span>
					<span
						className={`font-semibold text-sm ${
							isActive ? activeTextClass : 'text-muted-foreground'
						}`}
					>
						<NumberFlow value={displayCount} /> {label}
					</span>
				</span>
				<span
					className={`transition-colors duration-300 ${
						isActive
							? activeIndicatorClass
							: 'text-muted-foreground group-hover:text-foreground'
					}`}
				>
					{isActive ? (
						<ToggleRight className='h-4 w-4' aria-hidden='true' />
					) : (
						<ToggleLeft className='h-4 w-4' aria-hidden='true' />
					)}
				</span>
			</button>
			{counts.hidden > 0 && (
				<button
					type='button'
					onClick={onToggleShowHidden}
					title={viewHiddenTitle}
					aria-label={`${viewHiddenTitle}: ${breakdown}`}
					className='relative z-10 mt-1 flex items-center gap-1 pl-11 text-xs text-muted-foreground cursor-pointer text-left'
				>
					<EyeOff className='h-3 w-3' aria-hidden='true' />
					{hiddenSubline(counts, locale)}
				</button>
			)}
		</div>
	)
}

interface StatsSummaryProps {
	updated: StatCounts
	available: StatCounts
	unknown: StatCounts
	activeFilters: FilterStatus[]
	onToggleFilter: (status: FilterStatus) => void
	showHiddenMode: boolean
	onToggleShowHidden: () => void
	connectionInfo: DockerConnectionInfo
	hostInfo?: DockerHostInfo | null
	dict: Dictionary['stats']
	locale: Locale
}

export function StatsSummary({
	updated,
	available,
	unknown,
	activeFilters,
	onToggleFilter,
	showHiddenMode,
	onToggleShowHidden,
	connectionInfo,
	hostInfo,
	dict,
	locale
}: StatsSummaryProps) {
	const isFilterActive = (status: FilterStatus) =>
		activeFilters.includes(status)
	const displayed = (counts: StatCounts) =>
		showHiddenMode ? counts.total : counts.visible

	const updatedLabel =
		displayed(updated) === 1 ? dict.updatedImage : dict.updatedImages
	const availableLabel =
		displayed(available) === 1 ? dict.updateAvailable : dict.updatesAvailable
	const unknownLabel =
		displayed(unknown) === 1 ? dict.unknownImage : dict.unknownImages

	return (
		<div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
			<StatFilterCard
				status='updated'
				counts={updated}
				isActive={isFilterActive('updated')}
				onToggle={() => onToggleFilter('updated')}
				icon={Check}
				label={updatedLabel}
				activeCardClass='bg-muted border-green-500/50 ring-1 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
				activeIconClass='bg-green-950/30 text-green-500 border-green-500/20'
				activeTextClass='text-foreground'
				activeIndicatorClass='text-green-500'
				filterApplyLabel={dict.filterApply}
				filterRemoveLabel={dict.filterRemove}
				showHiddenMode={showHiddenMode}
				onToggleShowHidden={onToggleShowHidden}
				viewHiddenTitle={dict.viewHiddenContainers}
				locale={locale}
			/>

			<StatFilterCard
				status='available'
				counts={available}
				isActive={isFilterActive('available')}
				onToggle={() => onToggleFilter('available')}
				icon={ArrowUp}
				label={availableLabel}
				activeCardClass='bg-muted border-amber-500/50 ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
				activeIconClass='bg-amber-950/40 text-amber-500 border-amber-500/20'
				activeIndicatorClass='text-amber-500'
				filterApplyLabel={dict.filterApply}
				filterRemoveLabel={dict.filterRemove}
				gradient
				showHiddenMode={showHiddenMode}
				onToggleShowHidden={onToggleShowHidden}
				viewHiddenTitle={dict.viewHiddenContainers}
				locale={locale}
			/>

			<StatFilterCard
				status='unknown'
				counts={unknown}
				isActive={isFilterActive('unknown')}
				onToggle={() => onToggleFilter('unknown')}
				icon={HelpCircle}
				label={unknownLabel}
				activeCardClass='bg-muted border-muted-foreground/50 ring-1 ring-muted-foreground/20 shadow-[0_0_15px_rgba(115,115,115,0.1)]'
				activeIconClass='bg-muted text-muted-foreground border-border/50'
				activeTextClass='text-foreground'
				activeIndicatorClass='text-muted-foreground'
				filterApplyLabel={dict.filterApply}
				filterRemoveLabel={dict.filterRemove}
				showHiddenMode={showHiddenMode}
				onToggleShowHidden={onToggleShowHidden}
				viewHiddenTitle={dict.viewHiddenContainers}
				locale={locale}
			/>

			<div className='md:col-span-3 flex flex-col items-start gap-2 -mt-2 sm:flex-row sm:items-center'>
				{hostInfo && <HostInfoIndicator info={hostInfo} dict={dict} />}
				<RemoteConnectionIndicator
					info={connectionInfo}
					label={dict.remoteServer}
					tooltip={dict.remoteServerTooltip}
				/>
				<button
					type='button'
					onClick={onToggleShowHidden}
					aria-pressed={showHiddenMode}
					className={`shrink-0 sm:ml-auto flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
						showHiddenMode
							? 'bg-muted text-foreground border border-border'
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
