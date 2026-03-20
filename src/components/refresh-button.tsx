'use client'

import { RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { subscribeToLoading } from './loading-events'

export function RefreshButton() {
	const { pending } = useFormStatus()
	const [isEventLoading, setIsEventLoading] = useState(false)

	useEffect(() => {
		return subscribeToLoading((isLoading) => {
			setIsEventLoading(isLoading)
		})
	}, [])

	const isLoading = pending || isEventLoading

	return (
		<Button
			type='submit'
			variant='outline'
			size='icon'
			disabled={isLoading}
			aria-busy={isLoading}
			aria-label={isLoading ? 'Refreshing containers' : 'Refresh dashboard'}
			className={cn(
				'relative rounded-[3.5px] transition-all duration-300',
				isLoading
					? 'border-blue-500/50 bg-blue-500/15 text-blue-100 shadow-[0_0_4px_rgba(59,130,246,0.45)] ring-1 ring-blue-500/30 animate-pulse disabled:opacity-100 hover:bg-blue-500/20'
					: 'border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-80'
			)}
		>
			<RefreshCcw
				className={cn(
					'h-4 w-4 shrink-0',
					isLoading && 'animate-spin text-blue-400'
				)}
				aria-hidden
			/>
		</Button>
	)
}
