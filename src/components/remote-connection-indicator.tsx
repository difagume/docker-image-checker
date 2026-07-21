'use client'

import { Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip'
import type { DockerConnectionInfo } from '@/lib/docker-connection'

interface RemoteConnectionIndicatorProps {
	info: DockerConnectionInfo
	/** Short label, e.g. "Remote server". */
	label: string
	/** Longer description shown in the tooltip. */
	tooltip: string
}

/**
 * Subtle badge shown when the dashboard is monitoring a remote Docker daemon.
 * A soft pulsing dot signals a live connection, the host is displayed
 * (truncated on small screens) and the protocol is exposed as a compact tag.
 * Renders nothing for local connections.
 */
export function RemoteConnectionIndicator({
	info,
	label,
	tooltip
}: RemoteConnectionIndicatorProps) {
	if (!info.isRemote) {
		return null
	}

	const protocol = info.type.toUpperCase()

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						variant='outline'
						className='min-w-0 max-w-full cursor-default gap-1.5 bg-muted/40 py-0.5 pr-1.5 pl-2 text-muted-foreground'
					>
						<span className='relative flex h-1.5 w-1.5 shrink-0'>
							<span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60' />
							<span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500' />
						</span>
						<Server className='h-3 w-3 shrink-0' aria-hidden='true' />
						<span className='min-w-0 truncate font-medium text-foreground'>
							{info.host}
						</span>
						<span className='shrink-0 rounded-sm bg-muted px-1 py-px font-semibold text-[10px] text-muted-foreground uppercase'>
							{protocol}
						</span>
					</Badge>
				</TooltipTrigger>
				<TooltipContent side='top' className='max-w-[260px]'>
					<p className='font-medium'>{label}</p>
					<p className='text-background/80'>{tooltip}</p>
					<p className='mt-0.5 font-mono text-[11px] text-background/70'>
						{protocol} · {info.host}
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
