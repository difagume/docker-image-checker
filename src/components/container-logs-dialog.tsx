'use client'

import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import * as React from 'react'
import { ContainerLogsViewer } from '@/components/container-logs-viewer'
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
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

export type ContainerLogsDialogProps = {
	containerId: string
	containerName: string
	/** Imagen del contenedor, se muestra en la cabecera si se pasa. */
	image?: string
	/** Estado del contenedor: running, exited, etc. (crudo, decide el color del badge). */
	state?: string
	/** Etiqueta traducida del estado; si se omite se muestra `state` tal cual. */
	stateLabel?: string
	/** Textos traducidos de la sección `logs` del diccionario. */
	dict: Dictionary['logs']
	/** Uso controlado: si se omite, el diálogo se controla con `trigger`. */
	open?: boolean
	onOpenChange?: (open: boolean) => void
	/** Elemento que abre el diálogo (por ejemplo, el botón de la card). */
	trigger?: React.ReactNode
}

/**
 * Renderiza `realtimeHint` sustituyendo los placeholders {filterKey} y
 * {pauseKey} por sus teclas con estilo <kbd>.
 */
function RealtimeHint({ hint }: { hint: string }) {
	const parts = hint.split(/(\{filterKey\}|\{pauseKey\})/)
	return (
		<>
			{parts.map((part, index) => {
				if (part === '{filterKey}' || part === '{pauseKey}') {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: segmentos estáticos del texto traducido
						<kbd key={index} className='font-mono'>
							{part === '{filterKey}' ? '/' : 'P'}
						</kbd>
					)
				}
				// biome-ignore lint/suspicious/noArrayIndexKey: segmentos estáticos del texto traducido
				return <React.Fragment key={index}>{part}</React.Fragment>
			})}
		</>
	)
}

export function ContainerLogsDialog({
	containerId,
	containerName,
	image,
	state,
	stateLabel,
	dict,
	open,
	onOpenChange,
	trigger
}: ContainerLogsDialogProps) {
	const [internalOpen, setInternalOpen] = React.useState(false)
	const [expanded, setExpanded] = React.useState(false)

	const isControlled = open !== undefined
	const isOpen = isControlled ? open : internalOpen

	const handleOpenChange = (value: boolean) => {
		if (!isControlled) setInternalOpen(value)
		onOpenChange?.(value)
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent
				showCloseButton={false}
				className={cn(
					'flex flex-col gap-3 p-3 sm:max-w-none',
					expanded
						? 'h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none'
						: 'h-[85dvh] w-[calc(100vw-1.5rem)] lg:w-[min(1100px,92vw)]'
				)}
			>
				<DialogHeader className='gap-1 pr-16'>
					<DialogTitle className='flex flex-wrap items-center gap-2'>
						<span className='truncate font-mono'>{containerName}</span>
						{state ? (
							<Badge variant={state === 'running' ? 'secondary' : 'outline'}>
								{stateLabel ?? state}
							</Badge>
						) : null}
					</DialogTitle>
					<DialogDescription className='truncate'>
						{image ? `${image} · ` : ''}
						<RealtimeHint hint={dict.realtimeHint} />
					</DialogDescription>
				</DialogHeader>

				<div className='absolute top-2.5 right-2.5 flex items-center gap-1'>
					<Button
						size='icon-sm'
						variant='ghost'
						aria-label={expanded ? dict.restore : dict.maximize}
						onClick={() => setExpanded((value) => !value)}
					>
						{expanded ? <MinimizeIcon /> : <MaximizeIcon />}
					</Button>
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

				{/* El visor solo se monta (y por tanto solo abre el stream) con el diálogo abierto. */}
				{isOpen ? (
					<ContainerLogsViewer
						containerId={containerId}
						containerName={containerName}
						active={isOpen}
						dict={dict}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	)
}
