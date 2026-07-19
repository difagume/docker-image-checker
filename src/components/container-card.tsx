'use client'

import { motion, useReducedMotion } from 'framer-motion'
import {
	Activity,
	ArrowUpCircle,
	Bell,
	BellOff,
	Clock,
	Download,
	ExternalLink,
	Eye,
	EyeOff,
	Fingerprint,
	Loader2,
	Package,
	Server,
	Zap
} from 'lucide-react'
import React from 'react'
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger
} from '@/components/ui/tooltip'
import type {
	ContainerData,
	ReferenceUrlData
} from '@/hooks/use-container-updates'
import { formatRelativeTime } from '@/lib/format-relative-time'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'
import { ReferenceUrlPopover } from './reference-url-popover'

const cardVariants = {
	initial: { opacity: 0, scale: 0.96, y: 10 },
	animate: { opacity: 1, scale: 1, y: 0 },
	exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }
}

interface ContainerCardProps {
	item: ContainerData
	dict: Dictionary
	locale: Locale
	notificationsEnabled: boolean
	hiddenContainerIds: string[]
	ignoredNotificationIds: string[]
	referenceUrls: Record<string, ReferenceUrlData>
	updatingContainerId: string | null
	updateError: string | null
	onToggleHide: (id: string) => void
	onToggleIgnoreNotification: (id: string) => void
	onSetConfirmUpdate: (
		state: {
			containerId: string
			containerName: string
			containerImage: string
			containerVersion: string
			newVersion: string
			isRunning: boolean
		} | null
	) => void
	onSaveReferenceUrl: (imageName: string, url: string) => void
}

export const ContainerCard = React.memo(function ContainerCard({
	item,
	dict,
	locale,
	notificationsEnabled,
	hiddenContainerIds,
	ignoredNotificationIds,
	referenceUrls,
	updatingContainerId,
	updateError,
	onToggleHide,
	onToggleIgnoreNotification,
	onSetConfirmUpdate,
	onSaveReferenceUrl
}: ContainerCardProps) {
	const {
		container,
		isRunning,
		ports,
		updateStatus,
		containerName,
		displayCurrentVersion,
		latestVersion,
		lastUpdated,
		dockerHubUrl,
		policyState
	} = item

	const prefersReducedMotion = useReducedMotion()
	const hasUpdateAvailable = updateStatus === 'available'
	const isNewMajor = policyState === 'NEW_MAJOR_VERSION_AVAILABLE'

	const displayLatestVersion: string =
		latestVersion !== 'latest' &&
		latestVersion !== 'Unknown' &&
		latestVersion !== undefined
			? latestVersion
			: 'latest'

	let updateStatusInfo = null

	if (updateStatus === 'updated') {
		updateStatusInfo = (
			<span className='text-primary font-medium'>{dict.container.updated}</span>
		)
	} else if (updateStatus === 'available') {
		updateStatusInfo = (
			<Alert
				className={`p-3 ${
					isNewMajor
						? 'bg-violet-500/10 border-violet-500/50 text-violet-300'
						: 'bg-amber-500/10 border-amber-500/50 text-amber-200'
				}`}
			>
				{isNewMajor ? (
					<Zap className='h-4 w-4 text-violet-400!' aria-hidden='true' />
				) : (
					<ArrowUpCircle className='h-4 w-4 text-amber-400!' aria-hidden='true' />
				)}
				{dockerHubUrl ? (
					<a
						href={dockerHubUrl}
						target='_blank'
						rel='noopener noreferrer'
						className='hover:underline'
						aria-label={`${isNewMajor ? dict.container.newMajorAvailable : dict.container.updateAvailable} (opens in new tab)`}
					>
						<AlertTitle
							className={`font-bold text-sm mb-0 flex items-center gap-1.5 ${
								isNewMajor ? 'text-violet-400' : 'text-amber-400'
							}`}
						>
							{isNewMajor
								? dict.container.newMajorAvailable
								: dict.container.updateAvailable}
							<ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
						</AlertTitle>
					</a>
				) : (
					<AlertTitle
						className={`font-bold text-sm mb-0 ${
							isNewMajor ? 'text-violet-400' : 'text-amber-400'
						}`}
					>
						{isNewMajor
							? dict.container.newMajorAvailable
							: dict.container.updateAvailable}
					</AlertTitle>
				)}
				{lastUpdated && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<AlertDescription
									className={`flex items-center gap-1 hover:text-opacity-100 transition-colors cursor-help ${
										isNewMajor ? 'text-violet-300/80' : 'text-amber-300/80'
									}`}
								>
									<Clock className='h-3 w-3' aria-hidden='true' />
									<span className='text-xs'>
										{formatRelativeTime(new Date(lastUpdated), dict, locale)}
									</span>
								</AlertDescription>
							</TooltipTrigger>
							<TooltipContent
								side='left'
								className='bg-popover text-popover-foreground border-border'
							>
								<p>
									{new Date(lastUpdated).toLocaleString(
										locale === 'es'
											? 'es-ES'
											: locale === 'pt'
												? 'pt-BR'
												: 'en-US',
										{
											day: '2-digit',
											month: '2-digit',
											year: 'numeric',
											hour: '2-digit',
											minute: '2-digit'
										}
									)}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
				<AlertAction className='w-full flex flex-col items-center pt-1 -ml-3 gap-2'>
					{updateError && updatingContainerId === container.Id ? (
						<span className='text-xs text-destructive text-center'>
							{updateError}
						</span>
					) : null}
					<Button
						size='xs'
						disabled={updatingContainerId === container.Id}
						onClick={() => {
							onSetConfirmUpdate({
								containerId: container.Id,
								containerName,
								containerImage: container.Image,
								containerVersion: displayCurrentVersion,
								newVersion: displayLatestVersion,
								isRunning
							})
						}}
						className={cn(
							'transition-colors',
							isNewMajor
								? 'bg-transparent text-violet-400 border border-violet-500/50 hover:bg-violet-500/10'
								: 'bg-transparent text-amber-400 border border-amber-500/50 hover:bg-amber-500/10',
							updatingContainerId === container.Id ? 'opacity-50' : ''
						)}
					>
						{updatingContainerId === container.Id ? (
							<>
								<Loader2 className='mr-1 h-3 w-3 animate-spin' aria-hidden='true' />
								{dict.container.updating}
							</>
						) : (
							<>
								<Download className='mr-1 h-3 w-3' aria-hidden='true' />
								{dict.container.update}
							</>
						)}
					</Button>
				</AlertAction>
			</Alert>
		)
	} else if (updateStatus === 'local') {
		updateStatusInfo = (
			<span className='text-blue-500/70 font-medium'>
				{dict.container.local}
			</span>
		)
	} else if (updateStatus === 'unknown') {
		updateStatusInfo = (
			<span className='text-muted-foreground font-medium'>
				{dict.container.unknown}
			</span>
		)
	} else if (updateStatus === 'checking') {
		const checkingLabel = dict.container.checking
		updateStatusInfo = (
			<span className='text-muted-foreground font-medium flex items-center gap-1.5'>
				<Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden='true' />
				{checkingLabel}
			</span>
		)
	}

	return (
		<motion.div
			key={container.Id}
			layout={prefersReducedMotion ? false : true}
			variants={prefersReducedMotion ? undefined : cardVariants}
			initial={prefersReducedMotion ? undefined : 'initial'}
			animate={prefersReducedMotion ? undefined : 'animate'}
			exit={prefersReducedMotion ? undefined : 'exit'}
			transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
			className='min-w-0'
		>
			<Card
				className={`bg-card border-border text-card-foreground h-full transition-[border-color,opacity,filter] duration-300 overflow-hidden ${
					hasUpdateAvailable
						? isNewMajor
							? 'border-l-violet-500'
							: 'border-l-amber-500'
						: ''
				} ${hiddenContainerIds.includes(container.Id) ? 'opacity-40 grayscale-[0.5] scale-[0.98]' : ''}`}
			>
				<CardHeader>
					<div className='flex justify-between items-start gap-4'>
						<CardTitle className='text-lg font-semibold tracking-tight text-foreground wrap-anywhere break-normal flex items-start gap-2'>
							<span className='flex-1 line-clamp-3'>{containerName}</span>
							<div className='flex items-center gap-1 mt-1'>
								{notificationsEnabled && (
								<button
									type='button'
									onClick={() => onToggleIgnoreNotification(container.Id)}
									className={`transition-colors focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 shrink-0 ${
										ignoredNotificationIds.includes(container.Id)
											? 'text-muted-foreground hover:text-foreground'
											: 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20'
									}`}
									title={
										ignoredNotificationIds.includes(container.Id)
											? dict.container.enableNotifications
											: dict.container.disableNotifications
									}
									aria-label={
										ignoredNotificationIds.includes(container.Id)
											? dict.container.enableNotifications
											: dict.container.disableNotifications
									}
								>
										{ignoredNotificationIds.includes(container.Id) ? (
											<BellOff className='h-3.5 w-3.5' aria-hidden='true' />
										) : (
											<Bell className='h-3.5 w-3.5' aria-hidden='true' />
										)}
									</button>
								)}
								<button
									type='button'
									onClick={() => onToggleHide(container.Id)}
									className={`transition-colors focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 shrink-0 ${
										hiddenContainerIds.includes(container.Id)
											? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
											: 'text-muted-foreground hover:text-foreground'
									}`}
									title={
										hiddenContainerIds.includes(container.Id)
											? dict.container.showContainer
											: dict.container.hideContainer
									}
									aria-label={
										hiddenContainerIds.includes(container.Id)
											? dict.container.showContainer
											: dict.container.hideContainer
									}
								>
									{hiddenContainerIds.includes(container.Id) ? (
										<Eye className='h-3.5 w-3.5' aria-hidden='true' />
									) : (
										<EyeOff className='h-3.5 w-3.5' aria-hidden='true' />
									)}
								</button>
							</div>
						</CardTitle>
						<Badge
							variant='outline'
							className={`shrink-0 ${
								isRunning
									? 'bg-transparent text-green-500 border-green-500 rounded-md cursor-default'
									: 'bg-transparent text-red-500 border-red-500 rounded-md cursor-default'
							}`}
						>
							{dict.container.states[
								container.State.toLowerCase() as keyof typeof dict.container.states
							] || container.State}
						</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<div className='space-y-2 text-sm text-foreground'>
						<div className='flex justify-between items-center'>
							<div className='flex items-center gap-1.5 text-muted-foreground'>
								<Fingerprint className='h-3 w-3' aria-hidden='true' />
								<span className='font-semibold tracking-wider text-[11px]'>
									{dict.container.containerId}
								</span>
							</div>
							<span className='text-xs text-muted-foreground'>
								{container.Id.substring(0, 12)}
							</span>
						</div>
						<div className='flex justify-between items-center'>
							<div className='flex items-center gap-1.5 text-muted-foreground'>
								<Server className='h-3 w-3' aria-hidden='true' />
								<span className='font-semibold tracking-wider text-[11px]'>
									{dict.common.ports}
								</span>
							</div>
							<span className='text-xs text-muted-foreground truncate max-w-37.5'>
								{ports || '---'}
							</span>
						</div>
						<div className='flex justify-between items-center'>
							<div className='flex items-center gap-1.5 text-muted-foreground'>
								<Activity className='h-3 w-3' aria-hidden='true' />
								<span className='font-semibold tracking-wider text-[11px]'>
									{dict.common.status}
								</span>
							</div>
							<span className='text-xs text-muted-foreground'>
								{container.Status}
							</span>
						</div>
						<div className='pt-2 border-t border-border mt-2 space-y-2'>
							<div className='flex items-center justify-between'>
								<div className='flex items-center gap-2'>
									<Package className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
									<span className='text-foreground font-bold text-sm'>
										{dict.container.image}:
									</span>
							<ReferenceUrlPopover
									key={referenceUrls[container.Image.split(':')[0]]?.referenceUrl ?? ''}
									imageName={container.Image.split(':')[0]}
									currentUrl={
										referenceUrls[container.Image.split(':')[0]]?.referenceUrl
									}
									onSave={(url: string) => {
										onSaveReferenceUrl(container.Image.split(':')[0], url)
									}}
									dict={dict.container}
								/>
								</div>
								<span className='text-xs text-muted-foreground'>
									{container.ImageID.substring(7, 19)}
								</span>
							</div>

							<div className='space-y-1 pl-6 pt-1'>
								<div className='text-foreground pb-1'>
									{container.Image.split(':')[0]}
								</div>
								<div className='flex items-center justify-between'>
									<span className='text-muted-foreground font-semibold tracking-wider text-[11px]'>
										{dict.container.currentVersion}
									</span>
									<Badge
										variant='outline'
										className='bg-muted text-muted-foreground border-border rounded-md cursor-default max-w-[170px]'
									>
										<span className='truncate'>{displayCurrentVersion}</span>
									</Badge>
								</div>

								{hasUpdateAvailable && (
									<div className='flex items-center justify-between'>
										<span className='text-muted-foreground font-semibold tracking-wider text-[11px]'>
											{isNewMajor
												? dict.container.newMajorAvailable
												: displayCurrentVersion === displayLatestVersion
													? dict.container.newBuild
													: dict.container.newVersion}
										</span>

										<Badge
											variant='outline'
											className={`bg-muted border-border rounded-md cursor-default max-w-[170px] ${
												isNewMajor ? 'text-violet-500' : 'text-amber-500'
											}`}
										>
											<span className='truncate'>{displayLatestVersion}</span>
										</Badge>
									</div>
								)}
							</div>

							<div className='flex justify-end pt-1'>{updateStatusInfo}</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	)
})
