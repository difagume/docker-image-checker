import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DashboardGate } from '@/components/dashboard-gate'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'

export const metadata: Metadata = {
	title: 'Docker Image Checker',
	description:
		'Self-hosted dashboard to monitor Docker containers and detect available image updates.'
}

// Static shell: no cookies/headers/runtime APIs here. Auth + locale live in
// DashboardGate (inside Suspense); the proxy remains the primary auth barrier.
export default function Dashboard() {
	return (
		<div className='flex-1 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<Suspense fallback={<DashboardSkeleton />}>
					<DashboardGate />
				</Suspense>
			</div>
		</div>
	)
}
