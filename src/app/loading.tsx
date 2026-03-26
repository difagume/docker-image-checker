import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export default async function Loading() {
	const locale = await getLocale()
	const dict = getDictionary(locale)

	return (
		<div className='flex-1 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<div className='flex flex-col gap-2'>
					<div className='flex items-start justify-between'>
						<h1 className='text-4xl font-bold tracking-tight text-foreground'>
							{dict.dashboard.title}
						</h1>
					</div>
					<p className='text-muted-foreground'>{dict.dashboard.description}</p>
				</div>

				<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
					{Array.from({ length: 6 }).map((_, index) => (
						<div
							key={index.toString()}
							className='rounded-lg bg-muted/50 p-6 animate-pulse'
						>
							<div className='flex items-center justify-between mb-4'>
								<div className='h-5 w-32 bg-muted rounded' />
								<div className='h-5 w-16 bg-muted rounded' />
							</div>
							<div className='space-y-2'>
								<div className='h-4 w-full bg-muted/50 rounded' />
								<div className='h-4 w-3/4 bg-muted/50 rounded' />
							</div>
						</div>
					))}
				</div>

				<div className='grid gap-4 md:grid-cols-3'>
					{Array.from({ length: 3 }).map((_, index) => (
						<div
							key={index.toString()}
							className='rounded-lg bg-muted/50 p-6 animate-pulse'
						>
							<div className='h-4 w-20 bg-muted rounded mb-2' />
							<div className='h-8 w-12 bg-muted rounded' />
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
