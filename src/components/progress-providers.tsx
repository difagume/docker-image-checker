'use client'

import { ProgressProvider } from '@bprogress/next/app'
import { RefreshProgressBar } from './refresh-progress-bar'

/**
 * Client boundary for `@bprogress/next`.
 *
 * The bprogress modules don't ship a `'use client'` directive, so the provider
 * must be wrapped in our own client component before being used from the
 * (server) root layout.
 */
export function ProgressProviders({
	children
}: {
	children: React.ReactNode
}) {
	return (
		<ProgressProvider
			height='3px'
			color='#3b82f6'
			options={{ showSpinner: false }}
		>
			<RefreshProgressBar />
			{children}
		</ProgressProvider>
	)
}
