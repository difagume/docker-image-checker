'use client'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '@/components/ui/alert-dialog'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

interface UpdateConfirmDialogProps {
	confirmState: {
		containerId: string
		containerName: string
		containerImage: string
		containerVersion: string
		newVersion: string
		isRunning: boolean
	} | null
	onClose: () => void
	onConfirm: (
		containerId: string,
		containerImage: string,
		newVersion: string
	) => void
	dict: Dictionary
}

export function UpdateConfirmDialog({
	confirmState,
	onClose,
	onConfirm,
	dict
}: UpdateConfirmDialogProps) {
	return (
		<AlertDialog
			open={!!confirmState}
			onOpenChange={(open) => !open && onClose()}
		>
			<AlertDialogContent
				aria-describedby='update-confir-dialog'
				className='bg-neutral-900 border-neutral-800 text-neutral-50 max-w-sm'
			>
				<AlertDialogHeader>
					<AlertDialogTitle className='text-white text-base'>
						{dict.updateDialog?.title}
					</AlertDialogTitle>
					{confirmState?.isRunning && (
						<AlertDialogDescription className='text-red-400'>
							{dict.updateDialog?.downtimeWarning?.description}
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel
						variant='outline'
						className='bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700 items-center gap-2 hidden md:flex'
					>
						{dict.common?.cancel}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							if (confirmState) {
								onConfirm(
									confirmState.containerId,
									confirmState.containerImage,
									confirmState.newVersion
								)
								onClose()
							}
						}}
						className={cn(
							confirmState?.isRunning
								? 'bg-amber-600 hover:bg-amber-700 text-white'
								: 'bg-blue-600 hover:bg-blue-700 text-white'
						)}
					>
						{dict.updateDialog?.confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
