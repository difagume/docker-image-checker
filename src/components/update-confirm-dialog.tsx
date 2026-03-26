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
				className='max-w-sm'
			>
				<AlertDialogHeader>
					<AlertDialogTitle>{dict.updateDialog.title}</AlertDialogTitle>
					{confirmState?.isRunning && (
						<AlertDialogDescription className='text-destructive'>
							{dict.updateDialog.downtimeWarning.description}
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel className='hidden md:flex'>
						{dict.common.cancel}
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
					>
						{dict.updateDialog.confirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
