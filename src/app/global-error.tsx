'use client'

import { useEffect } from 'react'
import './globals.css'

// Root-layout error boundary. Replaces the root layout when it fails, so it
// must define its own <html>/<body> and its own styles.
export default function GlobalError({
	error,
	retry
}: {
	error: Error & { digest?: string }
	retry: () => void
}) {
	useEffect(() => {
		console.error('[Dashboard] Uncaught global error:', error)
	}, [error])

	return (
		<html lang='en'>
			<body className='min-h-dvh bg-background text-foreground'>
				<main className='flex min-h-dvh items-center justify-center p-8'>
					<div className='flex flex-col items-center gap-4 text-center'>
						<h2 className='text-xl font-semibold'>Something went wrong</h2>
						<p className='max-w-md text-muted-foreground'>
							Could not load the dashboard. Make sure Docker is running and the
							socket is accessible, then try again.
						</p>
						<button
							type='button'
							onClick={retry}
							className='inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90'
						>
							Try again
						</button>
					</div>
				</main>
			</body>
		</html>
	)
}
