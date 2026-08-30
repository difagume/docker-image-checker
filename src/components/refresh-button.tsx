'use client'

import { RefreshCcw } from 'lucide-react'
import { useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { setFormPending } from './loading-events'

/**
 * B-12: the sr-only refresh strings are dictionary-driven. The server passes
 * the localized values (DashboardGate has the dict); no client dictionary
 * plumbing and no prerender hazard.
 */
export interface RefreshButtonStrings {
	refreshAriaLabel: string
	refreshing: string
	upToDate: string
}

export function RefreshButton({ strings }: { strings: RefreshButtonStrings }) {
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
				aria-label={pending ? strings.refreshing : strings.refreshAriaLabel}
				className='relative rounded-sm border-border bg-muted hover:bg-neutral-700! hover:text-neutral-950! hover:border-neutral-700! disabled:opacity-80'
			>
				<RefreshCcw className='h-4 w-4 shrink-0' aria-hidden />
			</Button>
			<div role='status' aria-live='polite' className='sr-only'>
				{pending ? strings.refreshing : strings.upToDate}
			</div>
		</>
	)
}
