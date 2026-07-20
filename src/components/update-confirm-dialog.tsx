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
			<style>{`
				[data-slot="alert-dialog-overlay"] {
					backdrop-filter: blur(1px);
				}
			`}</style>
			<AlertDialogContent className='rounded-sm max-w-sm'>
				<AlertDialogHeader>
					<AlertDialogTitle>{dict.updateDialog.title}</AlertDialogTitle>
					{confirmState?.isRunning && (
						<AlertDialogDescription className='text-destructive'>
							{dict.updateDialog.downtimeWarning.description}
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel className='rounded-sm hidden md:flex'>
						{dict.common.cancel}
					</AlertDialogCancel>
					<AlertDialogAction
						className='rounded-sm'
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
