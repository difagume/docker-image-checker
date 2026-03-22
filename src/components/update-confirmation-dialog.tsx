'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Download, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { updateContainerImage } from '@/actions/docker'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/lib/i18n/dictionaries'

export type UpdateProgress =
	| 'idle'
	| 'confirming'
	| 'pulling'
	| 'recreating'
	| 'success'
	| 'error'

interface UpdateConfirmationDialogProps {
	isOpen: boolean
	onClose: () => void
	containerId: string
	containerName: string
	currentImage: string
	currentVersion: string
	newVersion: string
	isRunning: boolean
	dict: Dictionary
	onUpdateSuccess?: (newContainerId?: string) => void
}

export function UpdateConfirmationDialog({
	isOpen,
	onClose,
	containerId,
	containerName,
	currentImage,
	currentVersion,
	newVersion,
	isRunning,
	dict,
	onUpdateSuccess
}: UpdateConfirmationDialogProps) {
	const [progress, setProgress] = useState<UpdateProgress>('idle')
	const [error, setError] = useState<string | null>(null)

	const resetState = useCallback(() => {
		setProgress('idle')
		setError(null)
	}, [])

	useEffect(() => {
		if (!isOpen) {
			resetState()
		}
	}, [isOpen, resetState])

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen && progress === 'idle') {
				onClose()
			}
		}
		window.addEventListener('keydown', handleEscape)
		return () => window.removeEventListener('keydown', handleEscape)
	}, [isOpen, onClose, progress])

	const handleConfirm = async () => {
		setProgress('pulling')
		setError(null)

		try {
			const imageName = currentImage.includes(':')
				? `${currentImage.split(':')[0]}:${newVersion}`
				: `${currentImage}:${newVersion}`

			if (isRunning) {
				setProgress('recreating')
			}

			const result = await updateContainerImage(containerId, imageName)

			if (result.success) {
				setProgress('success')
				setTimeout(() => {
					onUpdateSuccess?.(result.newContainerId)
					onClose()
				}, 1500)
			} else {
				setProgress('error')
				setError(result.error || dict.updateDialog.unknownError)
			}
		} catch (err) {
			setProgress('error')
			setError(
				err instanceof Error ? err.message : dict.updateDialog.unknownError
			)
		}
	}

	const handleClose = () => {
		if (progress === 'pulling' || progress === 'recreating') {
			return
		}
		onClose()
	}

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50'
						onClick={handleClose}
					/>
					<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
						<motion.div
							initial={{ opacity: 0, scale: 0.95, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: 10 }}
							transition={{ duration: 0.15 }}
							className='relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[3.5px] shadow-2xl shadow-black/50'
						>
							<div className='flex items-center justify-between p-4 border-b border-neutral-800'>
								<h2 className='text-lg font-semibold text-white'>
									{dict.updateDialog?.title || 'Update Container Image'}
								</h2>
								{progress === 'idle' && (
									<Button
										type='button'
										onClick={handleClose}
										className='p-1 text-neutral-500 hover:text-neutral-300 transition-colors rounded'
									>
										<X className='h-5 w-5' />
									</Button>
								)}
							</div>

							<div className='p-4 space-y-4'>
								{progress === 'idle' && (
									<>
										<div className='space-y-3'>
											<div className='flex items-start gap-3'>
												<span className='text-sm text-neutral-400 min-w-20'>
													{dict.container.containerId}:
												</span>
												<span className='text-sm text-white font-mono'>
													{containerName}
												</span>
											</div>

											<div className='flex items-center gap-2 text-sm'>
												<span className='text-neutral-400 min-w-[80px]'>
													{dict.updateDialog?.currentImage || 'Current'}:
												</span>
												<code className='px-2 py-1 bg-neutral-800 rounded text-neutral-300 text-xs'>
													{currentImage.split(':')[0]}
												</code>
												<span className='text-neutral-500'>:</span>
												<code className='px-2 py-1 bg-neutral-800 rounded text-amber-500 text-xs'>
													{currentVersion}
												</code>
											</div>

											<div className='flex items-center justify-center py-2'>
												<ArrowRight className='h-4 w-4 text-neutral-500' />
											</div>

											<div className='flex items-center gap-2 text-sm'>
												<span className='text-neutral-400 min-w-[80px]'>
													{dict.updateDialog?.newImage || 'New'}:
												</span>
												<code className='px-2 py-1 bg-neutral-800 rounded text-neutral-300 text-xs'>
													{currentImage.split(':')[0]}
												</code>
												<span className='text-neutral-500'>:</span>
												<code className='px-2 py-1 bg-neutral-800 rounded text-green-500 text-xs'>
													{newVersion}
												</code>
											</div>
										</div>

										{isRunning && (
											<div className='flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-[3.5px]'>
												<AlertTriangle className='h-5 w-5 text-red-500 shrink-0 mt-0.5' />
												<div className='space-y-1'>
													<p className='text-sm font-medium text-red-400'>
														{dict.updateDialog?.downtimeWarning?.title ||
															'Service Downtime'}
													</p>
													<p className='text-xs text-red-300/80'>
														{dict.updateDialog?.downtimeWarning?.description ||
															'This container is currently running. The update process will stop, recreate, and restart the container, causing temporary downtime.'}
													</p>
												</div>
											</div>
										)}

										<div className='flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-[3.5px]'>
											<Download className='h-5 w-5 text-blue-500 shrink-0' />
											<p className='text-xs text-blue-300/80'>
												{dict.updateDialog?.pullingImage ||
													'The new image will be pulled from the registry before updating.'}
											</p>
										</div>
									</>
								)}

								{progress === 'pulling' && (
									<div className='flex flex-col items-center justify-center py-8 gap-4'>
										<Loader2 className='h-10 w-10 text-blue-500 animate-spin' />
										<div className='text-center'>
											<p className='text-sm font-medium text-white'>
												{dict.updateDialog?.pulling || 'Pulling image...'}
											</p>
											<p className='text-xs text-neutral-500 mt-1'>
												{currentImage.split(':')[0]}:{newVersion}
											</p>
										</div>
									</div>
								)}

								{progress === 'recreating' && (
									<div className='flex flex-col items-center justify-center py-8 gap-4'>
										<div className='relative'>
											<Loader2 className='h-10 w-10 text-amber-500 animate-spin' />
											<div className='absolute inset-0 flex items-center justify-center'>
												<div className='h-3 w-3 bg-amber-500 rounded-full animate-ping' />
											</div>
										</div>
										<div className='text-center'>
											<p className='text-sm font-medium text-white'>
												{dict.updateDialog?.recreating ||
													'Recreating container...'}
											</p>
											<p className='text-xs text-neutral-500 mt-1'>
												{dict.updateDialog?.stoppingRecreating ||
													'Stopping, removing, and starting new container'}
											</p>
										</div>
									</div>
								)}

								{progress === 'success' && (
									<div className='flex flex-col items-center justify-center py-8 gap-4'>
										<div className='h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center'>
											<svg
												className='h-6 w-6 text-green-500'
												fill='none'
												viewBox='0 0 24 24'
												stroke='currentColor'
												aria-label='Success'
											>
												<title>Success</title>
												<motion.path
													initial={{ pathLength: 0 }}
													animate={{ pathLength: 1 }}
													transition={{ duration: 0.3 }}
													strokeLinecap='round'
													strokeLinejoin='round'
													strokeWidth={2}
													d='M5 13l4 4L19 7'
												/>
											</svg>
										</div>
										<p className='text-sm font-medium text-green-400'>
											{dict.updateDialog?.success || 'Update successful!'}
										</p>
									</div>
								)}

								{progress === 'error' && (
									<div className='flex flex-col items-center justify-center py-6 gap-3'>
										<div className='h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center'>
											<AlertTriangle className='h-6 w-6 text-red-500' />
										</div>
										<div className='text-center max-w-full'>
											<p className='text-sm font-medium text-red-400'>
												{dict.updateDialog?.error || 'Update failed'}
											</p>
											{error && (
												<p className='text-xs text-red-300/70 mt-1 break-all px-4'>
													{error}
												</p>
											)}
										</div>
									</div>
								)}
							</div>

							<div className='flex gap-3 p-4 border-t border-neutral-800 bg-neutral-950/50'>
								{progress === 'idle' && (
									<>
										<Button
											variant='outline'
											onClick={handleClose}
											className='flex-1 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white'
										>
											{dict.common?.cancel || 'Cancel'}
										</Button>
										<Button
											onClick={handleConfirm}
											className={`flex-1 ${
												isRunning
													? 'bg-amber-600 hover:bg-amber-700 text-white'
													: 'bg-blue-600 hover:bg-blue-700 text-white'
											}`}
										>
											{dict.updateDialog?.confirm || 'Update'}
										</Button>
									</>
								)}

								{progress === 'error' && (
									<Button
										variant='outline'
										onClick={resetState}
										className='w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white'
									>
										{dict.updateDialog?.tryAgain || 'Try Again'}
									</Button>
								)}

								{(progress === 'pulling' ||
									progress === 'recreating' ||
									progress === 'success') && (
									<div className='w-full text-center text-xs text-neutral-500'>
										{progress === 'success'
											? dict.updateDialog?.closing || 'Closing...'
											: dict.updateDialog?.processing || 'Processing...'}
									</div>
								)}
							</div>
						</motion.div>
					</div>
				</>
			)}
		</AnimatePresence>
	)
}
