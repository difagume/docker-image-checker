'use client'

import { RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { setFormPending, subscribeRefreshState } from './loading-events'

export function RefreshButton() {
	const { pending } = useFormStatus()
	const [isChecking, setIsChecking] = useState(false)

	// Publish the server-action pending state for the top progress bar
	useEffect(() => {
		setFormPending(pending)
	}, [pending])

	// Track the background check to keep the button disabled while it runs
	useEffect(() => {
		return subscribeRefreshState((state) => {
			setIsChecking(state.checkTotal > 0)
		})
	}, [])

	const isLoading = pending || isChecking

	return (
		<Button
			type='submit'
			variant='outline'
			size='icon'
			disabled={isLoading}
			aria-busy={isLoading}
			aria-label={isLoading ? 'Refreshing containers' : 'Refresh dashboard'}
			className='relative rounded-sm border-border bg-muted hover:bg-neutral-700! hover:text-neutral-950! hover:border-neutral-700! disabled:opacity-80'
		>
			<RefreshCcw className='h-4 w-4 shrink-0' aria-hidden />
		</Button>
	)
}
