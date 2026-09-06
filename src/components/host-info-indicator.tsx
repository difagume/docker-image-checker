'use client'

import { Cpu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger
} from '@/components/ui/popover'
import type { DockerHostInfo } from '@/lib/docker-inventory'
import { formatBytes } from '@/lib/docker-stats'
import type { Dictionary } from '@/lib/i18n/dictionaries'

interface HostInfoIndicatorProps {
	info: DockerHostInfo
	dict: Dictionary['stats']
}

function InfoRow({ label, value }: { label: string; value: string }) {
	if (!value) return null
	return (
		<div className='flex items-baseline justify-between gap-3 text-xs'>
			<dt className='shrink-0 text-muted-foreground'>{label}</dt>
			<dd className='min-w-0 truncate text-right font-medium text-foreground'>
				{value}
			</dd>
		</div>
	)
}

/**
 * Compact badge summarizing the Docker daemon's host (server version, OS
 * type, CPUs). Clicking it opens a popover with the full `docker info`
 * details. Always rendered — unlike the remote-connection badge — so local
 * users get host visibility too.
 */
export function HostInfoIndicator({ info, dict }: HostInfoIndicatorProps) {
	const osType = info.osType.toUpperCase()
	const containersSummary = [
		`${info.containers.running} ${dict.hostRunning}`,
		`${info.containers.paused} ${dict.hostPaused}`,
		`${info.containers.stopped} ${dict.hostStopped}`
	].join(' · ')

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Badge asChild variant='outline'>
					<button
						type='button'
						aria-label={dict.hostTooltip}
						className='min-w-0 max-w-full cursor-pointer gap-1.5 bg-muted/40 py-0.5 pr-1.5 pl-2 text-muted-foreground hover:bg-muted/60'
					>
						<Cpu className='h-3 w-3 shrink-0' aria-hidden='true' />
						<span className='min-w-0 truncate font-medium text-foreground'>
							Docker {info.serverVersion}
						</span>
						{osType && (
							<span className='shrink-0 rounded-sm bg-muted px-1 py-px font-semibold text-[10px] text-muted-foreground uppercase'>
								{osType}
							</span>
						)}
					</button>
				</Badge>
			</PopoverTrigger>
			<PopoverContent align='start' className='w-80'>
				<PopoverHeader>
					<PopoverTitle>{dict.hostTitle}</PopoverTitle>
					<PopoverDescription>{dict.hostTooltip}</PopoverDescription>
				</PopoverHeader>
				<dl className='mt-3 space-y-1.5'>
					<InfoRow label={dict.hostName} value={info.name} />
					<InfoRow
						label={dict.hostOs}
						value={info.operatingSystem || info.osType}
					/>
					<InfoRow label={dict.hostKernel} value={info.kernelVersion} />
					<InfoRow label={dict.hostArchitecture} value={info.architecture} />
					<InfoRow label={dict.hostStorageDriver} value={info.storageDriver} />
					<InfoRow label={dict.hostCpus} value={String(info.cpus)} />
					<InfoRow label={dict.hostMemory} value={formatBytes(info.memTotal)} />
					<InfoRow label={dict.hostImages} value={String(info.images)} />
					<InfoRow label={dict.hostRootDir} value={info.dockerRootDir} />
				</dl>
				<div className='mt-3 border-t pt-3'>
					<div className='flex items-baseline justify-between gap-3 text-xs'>
						<span className='shrink-0 text-muted-foreground'>
							{dict.hostContainers}
						</span>
						<span className='text-right font-medium text-foreground'>
							{info.containers.total} · {containersSummary}
						</span>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
