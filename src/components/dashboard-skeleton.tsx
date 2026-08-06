/**
 * Shared loading fallback for the dashboard Suspense boundaries (static shell
 * in `page.tsx` and the nested data Suspense in `DashboardGate`).
 */
export function DashboardSkeleton() {
	return (
		<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					key={index.toString()}
					className='rounded-sm border border-border bg-muted/50 p-6 animate-pulse'
				>
					<div className='flex items-center justify-between mb-4'>
						<div className='h-5 w-32 bg-muted rounded-sm' />
						<div className='h-5 w-16 bg-muted rounded-sm' />
					</div>
					<div className='space-y-2'>
						<div className='h-4 w-full bg-muted/50 rounded-sm' />
						<div className='h-4 w-3/4 bg-muted/50 rounded-sm' />
					</div>
				</div>
			))}
		</div>
	)
}
