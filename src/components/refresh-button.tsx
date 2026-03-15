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
			className='relative bg-neutral-800 hover:bg-neutral-700 text-white rounded-[3.5px] border-neutral-700 disabled:opacity-80'
		>
			<RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
		</Button>
	)
}
