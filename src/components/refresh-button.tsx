'use client'

import { RefreshCcw } from 'lucide-react'
import { useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { setFormPending } from './loading-events'

export function RefreshButton() {
	const { pending } = useFormStatus()

	// Publish the server-action pending state for the top progress bar
	useEffect(() => {
		setFormPending(pending)
	}, [pending])

	return (
		<>
			<Button
				type='submit'
				variant='outline'
				size='icon'
				disabled={pending}
				aria-busy={pending}
				aria-label={pending ? 'Refreshing containers' : 'Refresh dashboard'}
				className='relative rounded-sm border-border bg-muted hover:bg-neutral-700! hover:text-neutral-950! hover:border-neutral-700! disabled:opacity-80'
			>
				<RefreshCcw className='h-4 w-4 shrink-0' aria-hidden />
			</Button>
			<div role='status' aria-live='polite' className='sr-only'>
				{pending ? 'Refreshing containers' : 'Dashboard up to date'}
			</div>
		</>
	)
}
