'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from '@/components/ui/dialog'
import { useContainerStats } from '@/hooks/use-container-stats'
import {
	formatBytes,
	formatPercent,
	type StatsSample,
	type StatsStatus,
	sparklinePoints
} from '@/lib/docker-stats'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

export type ContainerMetricsDialogProps = {
	containerId: string
	containerName: string
	/** Imagen del contenedor, se muestra en la cabecera si se pasa. */
	image?: string
	/** Estado del contenedor: running, exited, etc. (crudo, decide el color del badge). */
	state?: string
	/** Etiqueta traducida del estado; si se omite se muestra `state` tal cual. */
	stateLabel?: string
	/** Textos traducidos de la sección `metrics` del diccionario. */
	dict: Dictionary['metrics']
	/** Uso controlado: si se omite, el diálogo se controla con `trigger`. */
	open?: boolean
	onOpenChange?: (open: boolean) => void
	/** Elemento que abre el diálogo (por ejemplo, el botón de la card). */
	trigger?: React.ReactNode
}

/** Serie de bytes/segundo derivada de dos muestras consecutivas. */
function rateSeries(samples: StatsSample[], pick: (s: StatsSample) => number) {
	const values: number[] = []
	for (let i = 1; i < samples.length; i++) {
		const dt = (samples[i].ts - samples[i - 1].ts) / 1000
		values.push(dt > 0 ? (pick(samples[i]) - pick(samples[i - 1])) / dt : 0)
	}
	return values
}

function Sparkline({
	values,
	className
}: {
	values: number[]
	className?: string
}) {
	const points = sparklinePoints(values)
	return (
		<svg
			viewBox='0 0 100 24'
			preserveAspectRatio='none'
			className='block h-8 w-full min-w-0'
			aria-hidden='true'
		>
			<polyline
				points={points ?? undefined}
				fill='none'
				stroke='currentColor'
				strokeWidth='1.5'
				strokeLinejoin='round'
				strokeLinecap='round'
				className={cn('opacity-70', className)}
			/>
		</svg>
	)
}

function StatusIndicator({
	status,
	labels
}: {
	status: StatsStatus
	labels: Dictionary['metrics']['status']
}) {
	const map: Record<StatsStatus, { label: string; className: string }> = {
		live: { label: labels.live, className: 'bg-success' },
		connecting: {
			label: labels.connecting,
			className: 'bg-warning animate-pulse'
		},
		error: { label: labels.error, className: 'bg-destructive' },
		closed: { label: labels.idle, className: 'bg-muted-foreground' },
		idle: { label: labels.idle, className: 'bg-muted-foreground' }
	}
	const state = map[status] ?? map.idle

	return (
		<span className='flex items-center gap-1.5'>
			<span className={cn('size-2 rounded-full', state.className)} />
			{state.label}
		</span>
	)
}

function MetricRow({
	label,
	value,
	hint,
	series,
	sparklineClassName,
	empty
}: {
	label: string
	value: string
	hint?: string
	series: number[]
	sparklineClassName: string
	empty: boolean
}) {
	return (
		<div className='space-y-1.5'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className='text-muted-foreground font-semibold tracking-wider text-[11px]'>
					{label}
				</span>
				<span className='text-sm text-foreground tabular-nums'>
					{empty ? '—' : value}
					{hint ? (
						<span className='text-muted-foreground text-xs'> {hint}</span>
					) : null}
				</span>
			</div>
			{empty ? (
				<div className='h-8 rounded-sm bg-muted/40' />
			) : (
				<Sparkline values={series} className={sparklineClassName} />
			)}
		</div>
	)
}

export function ContainerMetricsDialog({
	containerId,
	containerName,
	image,
	state,
	stateLabel,
	dict,
	open,
	onOpenChange,
	trigger
}: ContainerMetricsDialogProps) {
	const [internalOpen, setInternalOpen] = React.useState(false)

	const isControlled = open !== undefined
	const isOpen = isControlled ? open : internalOpen

	const handleOpenChange = (value: boolean) => {
		if (!isControlled) setInternalOpen(value)
		onOpenChange?.(value)
	}

	// El stream solo se abre (y se cierra) con el diálogo abierto.
	const { samples, status } = useContainerStats({
		containerId,
		enabled: isOpen
	})

	const isRunning = state ? state === 'running' : true
	const hasData = samples.length > 0
	const latest = samples.at(-1)
	const cpuSeries = samples.map((sample) => sample.cpuPercent)
	const memSeries = samples.map((sample) => sample.memUsage)
	const netRxSeries = rateSeries(samples, (sample) => sample.netRx)
	const netTxSeries = rateSeries(samples, (sample) => sample.netTx)
	const diskReadSeries = rateSeries(samples, (sample) => sample.blockRead)
	const diskWriteSeries = rateSeries(samples, (sample) => sample.blockWrite)

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent
				showCloseButton={false}
				className='[grid-template-columns:minmax(0,1fr)] w-[calc(100vw-1.5rem)] sm:max-w-md'
			>
				<DialogHeader className='gap-1 pr-16'>
					<DialogTitle className='flex flex-wrap items-center gap-2'>
						<span className='min-w-0 truncate font-mono'>{containerName}</span>
						{state ? (
							<Badge variant={state === 'running' ? 'secondary' : 'outline'}>
								{stateLabel ?? state}
							</Badge>
						) : null}
					</DialogTitle>
					<DialogDescription className='truncate'>
						{image ? `${image} · ` : ''}
						{dict.realtimeHint}
					</DialogDescription>
				</DialogHeader>

				<div className='absolute top-2.5 right-2.5 flex items-center gap-1'>
					<Button
						size='icon-sm'
						variant='ghost'
						aria-label={dict.close}
						onClick={() => handleOpenChange(false)}
					>
						<span aria-hidden='true' className='text-base leading-none'>
							&times;
						</span>
					</Button>
				</div>

				{hasData ? (
					<StatusIndicator status={status} labels={dict.status} />
				) : null}

				{isRunning || hasData ? (
					<div className='min-w-0 space-y-4'>
						<MetricRow
							label={dict.cpu}
							value={formatPercent(latest?.cpuPercent ?? 0)}
							series={cpuSeries}
							sparklineClassName='text-sky-400'
							empty={!hasData}
						/>
						<MetricRow
							label={dict.memory}
							value={formatBytes(latest?.memUsage ?? 0)}
							hint={
								latest && latest.memLimit > 0
									? dict.ofLimit.replace(
											'{limit}',
											formatBytes(latest.memLimit)
										)
									: undefined
							}
							series={memSeries}
							sparklineClassName='text-violet-400'
							empty={!hasData}
						/>
						<MetricRow
							label={dict.network}
							value={`${formatBytes(netRxSeries.at(-1) ?? 0)}/s`}
							hint={`↓ / ${formatBytes(netTxSeries.at(-1) ?? 0)}/s ↑`}
							series={netRxSeries}
							sparklineClassName='text-emerald-400'
							empty={!hasData}
						/>
						<MetricRow
							label={dict.disk}
							value={`${formatBytes(diskReadSeries.at(-1) ?? 0)}/s`}
							hint={`↓ / ${formatBytes(diskWriteSeries.at(-1) ?? 0)}/s ↑`}
							series={diskReadSeries}
							sparklineClassName='text-amber-400'
							empty={!hasData}
						/>
					</div>
				) : (
					<p className='text-muted-foreground py-6 text-center text-sm'>
						{dict.notRunning}
					</p>
				)}
			</DialogContent>
		</Dialog>
	)
}
