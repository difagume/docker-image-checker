'use client'

import {
	ArrowDownToLineIcon,
	ArrowDownWideNarrowIcon,
	CheckIcon,
	ClockIcon,
	CopyIcon,
	DownloadIcon,
	EraserIcon,
	FilterIcon,
	PauseIcon,
	PlayIcon,
	RotateCwIcon,
	SearchIcon,
	TerminalIcon,
	WrapTextIcon,
	XIcon
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger
} from '@/components/ui/tooltip'
import { useContainerLogs } from '@/hooks/use-container-logs'
import {
	buildLogFileName,
	formatTimestamp,
	type LogLevel,
	type LogLine,
	serializeLogs,
	TAIL_OPTIONS
} from '@/lib/docker-logs'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

const LEVEL_VALUES: LogLevel[] = ['error', 'warn', 'info', 'debug']

const LEVEL_TEXT: Record<LogLevel, string> = {
	error: 'text-destructive',
	warn: 'text-warning',
	info: 'text-foreground/90',
	debug: 'text-muted-foreground'
}

export type ContainerLogsViewerProps = {
	containerId: string
	containerName: string
	/** Cuando es false se cierra el stream (útil al cerrar el diálogo). */
	active?: boolean
	/** Textos traducidos de la sección `logs` del diccionario. */
	dict: Dictionary['logs']
	className?: string
}

export function ContainerLogsViewer({
	containerId,
	containerName,
	active = true,
	dict,
	className
}: ContainerLogsViewerProps) {
	const [tail, setTail] = React.useState<number>(250)
	const [paused, setPaused] = React.useState(false)
	const [query, setQuery] = React.useState('')
	const [levels, setLevels] = React.useState<LogLevel[]>([
		'error',
		'warn',
		'info',
		'debug'
	])
	const [stream, setStream] = React.useState<'all' | 'stdout' | 'stderr'>('all')
	const [wrap, setWrap] = React.useState(true)
	const [timestamps, setTimestamps] = React.useState(true)
	const [follow, setFollow] = React.useState(true)
	const [copied, setCopied] = React.useState(false)

	const scrollRef = React.useRef<HTMLDivElement>(null)
	const searchRef = React.useRef<HTMLInputElement>(null)

	const { lines, status, pendingCount, clear, reconnect } = useContainerLogs({
		containerId,
		tail,
		enabled: active,
		paused
	})

	const filtered = React.useMemo(() => {
		const needle = query.trim().toLowerCase()
		return lines.filter((line) => {
			if (!levels.includes(line.level)) return false
			if (stream !== 'all' && line.stream !== stream) return false
			if (needle && !line.message.toLowerCase().includes(needle)) return false
			return true
		})
	}, [lines, levels, stream, query])

	const scrollToBottom = React.useCallback(() => {
		const node = scrollRef.current
		if (!node) return
		node.scrollTop = node.scrollHeight
	}, [])

	// Auto-scroll mientras el usuario esté "siguiendo" el final del log.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-ejecutar cuando cambian las líneas visibles o el layout (wrap/timestamps)
	React.useEffect(() => {
		if (!follow) return
		scrollToBottom()
	}, [filtered.length, follow, wrap, timestamps, scrollToBottom])

	const handleScroll = React.useCallback(() => {
		const node = scrollRef.current
		if (!node) return
		const distance = node.scrollHeight - node.scrollTop - node.clientHeight
		setFollow(distance < 40)
	}, [])

	const copyAll = React.useCallback(async () => {
		if (filtered.length === 0) return
		await navigator.clipboard.writeText(serializeLogs(filtered, { timestamps }))
		setCopied(true)
		window.setTimeout(() => setCopied(false), 1200)
		toast.success(dict.linesCopied.replace('{count}', String(filtered.length)))
	}, [filtered, timestamps, dict])

	const copyLine = React.useCallback(
		async (line: LogLine) => {
			await navigator.clipboard.writeText(line.message)
			toast.success(dict.lineCopied)
		},
		[dict]
	)

	const download = React.useCallback(() => {
		const blob = new Blob([serializeLogs(filtered, { timestamps: true })], {
			type: 'text/plain;charset=utf-8'
		})
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = buildLogFileName(containerName)
		anchor.click()
		URL.revokeObjectURL(url)
		toast.success(dict.logDownloaded)
	}, [filtered, containerName, dict])

	const errorCount = React.useMemo(
		() => lines.filter((line) => line.level === 'error').length,
		[lines]
	)

	const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement
		const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

		if (event.key === '/' && !typing) {
			event.preventDefault()
			searchRef.current?.focus()
			return
		}
		if (event.key === 'Escape' && query) {
			event.preventDefault()
			event.stopPropagation()
			setQuery('')
			return
		}
		if (event.key.toLowerCase() === 'p' && !typing) {
			event.preventDefault()
			setPaused((value) => !value)
		}
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: atajos de teclado (/, P, Esc) del visor; el foco vive en los hijos interactivos
		<div
			className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}
			onKeyDown={onKeyDown}
		>
			{/* Barra de acciones */}
			<div className='flex flex-wrap items-center gap-2'>
				<ButtonGroup>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size='sm'
								variant={paused ? 'default' : 'outline'}
								onClick={() => setPaused((value) => !value)}
								aria-pressed={paused}
							>
								{paused ? (
									<PlayIcon data-icon='inline-start' />
								) : (
									<PauseIcon data-icon='inline-start' />
								)}
								{paused ? dict.resume : dict.pause}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{paused ? dict.resumeTooltip : dict.pauseTooltip}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size='icon-sm'
								variant='outline'
								onClick={reconnect}
								aria-label={dict.reconnect}
							>
								<RotateCwIcon />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{dict.reconnectTooltip}</TooltipContent>
					</Tooltip>
				</ButtonGroup>

				<div className='relative min-w-0 flex-1 basis-40'>
					<SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
					<Input
						ref={searchRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={dict.filterPlaceholder}
						aria-label={dict.filterAriaLabel}
						className='h-8 pl-8 font-mono text-xs'
					/>
					{query ? (
						<Button
							size='icon-xs'
							variant='ghost'
							aria-label={dict.clearSearch}
							onClick={() => setQuery('')}
							className='absolute top-1/2 right-1 -translate-y-1/2'
						>
							<XIcon />
						</Button>
					) : null}
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size='sm' variant='outline'>
							<FilterIcon data-icon='inline-start' />
							{dict.filters}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className='w-48' align='end'>
						<DropdownMenuGroup>
							<DropdownMenuLabel>{dict.severity}</DropdownMenuLabel>
							{LEVEL_VALUES.map((level) => (
								<DropdownMenuCheckboxItem
									key={level}
									checked={levels.includes(level)}
									onCheckedChange={(checked) =>
										setLevels((prev) =>
											checked
												? [...prev, level]
												: prev.filter((item) => item !== level)
										)
									}
								>
									{dict.levels[level]}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuLabel>{dict.view}</DropdownMenuLabel>
							<DropdownMenuCheckboxItem
								checked={timestamps}
								onCheckedChange={(checked) => setTimestamps(checked)}
							>
								<ClockIcon />
								{dict.timestamps}
							</DropdownMenuCheckboxItem>
							<DropdownMenuCheckboxItem
								checked={wrap}
								onCheckedChange={(checked) => setWrap(checked)}
							>
								<WrapTextIcon />
								{dict.wrapLines}
							</DropdownMenuCheckboxItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>

				<ToggleGroup
					type='single'
					size='sm'
					variant='outline'
					spacing={0}
					value={stream}
					onValueChange={(value) =>
						setStream((value as typeof stream) || 'all')
					}
				>
					<ToggleGroupItem value='all' aria-label={dict.allStreams}>
						{dict.all}
					</ToggleGroupItem>
					<ToggleGroupItem value='stdout'>stdout</ToggleGroupItem>
					<ToggleGroupItem value='stderr'>stderr</ToggleGroupItem>
				</ToggleGroup>

				<Select
					value={String(tail)}
					onValueChange={(value) => setTail(Number(value))}
				>
					<SelectTrigger size='sm' aria-label={dict.tailAriaLabel}>
						<ArrowDownWideNarrowIcon className='text-muted-foreground' />
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{TAIL_OPTIONS.map((option) => (
								<SelectItem key={option} value={String(option)}>
									{dict.tailOption.replace('{count}', String(option))}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>

				<ButtonGroup className='ml-auto'>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size='icon-sm'
								variant='outline'
								onClick={copyAll}
								disabled={filtered.length === 0}
								aria-label={dict.copyVisible}
							>
								{copied ? <CheckIcon /> : <CopyIcon />}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{dict.copyVisibleTooltip}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size='icon-sm'
								variant='outline'
								onClick={download}
								disabled={filtered.length === 0}
								aria-label={dict.download}
							>
								<DownloadIcon />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{dict.downloadTooltip}</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size='icon-sm'
								variant='outline'
								onClick={clear}
								disabled={lines.length === 0}
								aria-label={dict.clearConsole}
							>
								<EraserIcon />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{dict.clearConsole}</TooltipContent>
					</Tooltip>
				</ButtonGroup>
			</div>

			{/* Consola */}
			<div className='relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/30'>
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					role='log'
					aria-live='polite'
					aria-label={dict.logsOf.replace('{name}', containerName)}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: role="log" enfocable para desplazarse con teclado
					tabIndex={0}
					className='min-h-0 flex-1 overflow-auto py-1.5 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
				>
					{status === 'connecting' && lines.length === 0 ? (
						<div className='flex h-full items-center justify-center gap-2 text-muted-foreground'>
							<Spinner />
							{dict.connecting}
						</div>
					) : null}

					{status !== 'connecting' && filtered.length === 0 ? (
						<Empty className='h-full font-sans'>
							<EmptyHeader>
								<EmptyMedia variant='icon'>
									<TerminalIcon />
								</EmptyMedia>
								<EmptyTitle>{dict.emptyTitle}</EmptyTitle>
								<EmptyDescription>
									{lines.length === 0 ? dict.emptyNoLogs : dict.emptyFiltered}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}

					{filtered.map((line) => (
						<LogRow
							key={line.id}
							line={line}
							query={query}
							wrap={wrap}
							timestamps={timestamps}
							copyLabel={dict.copyLine}
							onCopy={copyLine}
						/>
					))}
				</div>

				{/* Avisos flotantes */}
				<div className='pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-2'>
					{paused && pendingCount > 0 ? (
						<Button
							size='sm'
							className='pointer-events-auto shadow-md'
							onClick={() => setPaused(false)}
						>
							<PlayIcon data-icon='inline-start' />
							{dict.newLines.replace('{count}', String(pendingCount))}
						</Button>
					) : null}
					{!follow ? (
						<Button
							size='sm'
							variant='outline'
							className='pointer-events-auto shadow-md'
							onClick={() => {
								setFollow(true)
								scrollToBottom()
							}}
						>
							<ArrowDownToLineIcon data-icon='inline-start' />
							{dict.goToEnd}
						</Button>
					) : null}
				</div>
			</div>

			{/* Barra de estado */}
			<div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
				<StatusIndicator status={status} labels={dict.status} />
				<Separator orientation='vertical' className='h-3.5' />
				<span>
					{filtered.length === lines.length
						? dict.linesCount.replace('{count}', String(lines.length))
						: dict.linesFiltered
								.replace('{filtered}', String(filtered.length))
								.replace('{total}', String(lines.length))}
				</span>
				{errorCount > 0 ? (
					<Badge variant='destructive'>
						{dict.errorsCount.replace('{count}', String(errorCount))}
					</Badge>
				) : null}
				<span className='ml-auto font-mono'>{containerId.slice(0, 12)}</span>
			</div>
		</div>
	)
}

function StatusIndicator({
	status,
	labels
}: {
	status: string
	labels: Dictionary['logs']['status']
}) {
	const map: Record<string, { label: string; className: string }> = {
		live: { label: labels.live, className: 'bg-success' },
		paused: { label: labels.paused, className: 'bg-warning' },
		connecting: {
			label: labels.connecting,
			className: 'bg-warning animate-pulse'
		},
		error: { label: labels.error, className: 'bg-destructive' },
		closed: { label: labels.closed, className: 'bg-muted-foreground' },
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

function LogRow({
	line,
	query,
	wrap,
	timestamps,
	copyLabel,
	onCopy
}: {
	line: LogLine
	query: string
	wrap: boolean
	timestamps: boolean
	copyLabel: string
	onCopy: (line: LogLine) => void
}) {
	return (
		<div
			className={cn(
				'group/row relative flex gap-2 px-3 py-0.5 hover:bg-accent/60',
				line.level === 'error' && 'bg-destructive/5'
			)}
		>
			{timestamps ? (
				<span className='shrink-0 tabular-nums text-muted-foreground/70 select-none'>
					{formatTimestamp(line.ts)}
				</span>
			) : null}
			{line.stream === 'stderr' ? (
				<span className='shrink-0 text-destructive select-none'>err</span>
			) : null}
			<span
				className={cn(
					'min-w-0 flex-1',
					wrap ? 'break-words whitespace-pre-wrap' : 'truncate',
					LEVEL_TEXT[line.level]
				)}
			>
				<Highlight text={line.message} query={query} />
			</span>
			<Button
				size='icon-xs'
				variant='ghost'
				aria-label={copyLabel}
				onClick={() => onCopy(line)}
				className='absolute top-0 right-1 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'
			>
				<CopyIcon />
			</Button>
		</div>
	)
}

function Highlight({ text, query }: { text: string; query: string }) {
	const needle = query.trim()
	if (!needle) return <>{text}</>

	const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'))
	return (
		<>
			{parts.map((part, index) =>
				part.toLowerCase() === needle.toLowerCase() ? (
					<mark
						// biome-ignore lint/suspicious/noArrayIndexKey: segmentos derivados del split, sin identidad propia
						key={index}
						className='rounded-sm bg-warning/30 text-foreground'
					>
						{part}
					</mark>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: segmentos derivados del split, sin identidad propia
					<React.Fragment key={index}>{part}</React.Fragment>
				)
			)}
		</>
	)
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
