'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Route-segment error boundary. Client component: it only receives { error,
// retry }, so it cannot resolve the i18n dictionary (getLocale() reads request
// headers). It uses concise neutral copy instead.
export default function DashboardError({
	error,
	retry
}: {
	error: Error & { digest?: string }
	retry: () => void
}) {
	useEffect(() => {
		console.error('[Dashboard] Uncaught error:', error)
	}, [error])

	return (
		<div className='flex flex-1 items-center justify-center p-8'>
			<div className='flex flex-col items-center gap-4 text-center'>
				<h2 className='text-xl font-semibold text-foreground'>
					Something went wrong
				</h2>
				<p className='max-w-md text-muted-foreground'>
					Could not load the dashboard. Make sure Docker is running and the
					socket is accessible, then try again.
				</p>
				<Button type='button' onClick={retry}>
					Try again
				</Button>
			</div>
		</div>
	)
}
