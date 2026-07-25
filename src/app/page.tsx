import type { Metadata } from 'next'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { checkAuth, logout } from '@/actions/auth'
import { DashboardContent } from '@/components/dashboard-content'
import { LogoutButton } from '@/components/logout-button'
import { RefreshButton } from '@/components/refresh-button'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export const metadata: Metadata = {
	title: 'Docker Image Checker',
	description:
		'Self-hosted dashboard to monitor Docker containers and detect available image updates.'
}

export default async function Dashboard() {
	const [auth, locale] = process.env.AUTH_HTPASSWD
		? await Promise.all([checkAuth(), getLocale()])
		: [null, await getLocale()]

	if (auth && !auth.authenticated) redirect('/login')
	const dict = getDictionary(locale)
	const authEnabled = !!process.env.AUTH_HTPASSWD

	async function refresh() {
		'use server'
		// updateTag expires immediately (read-your-writes) so the re-render
		// after the action always re-scans the daemon instead of serving stale
		updateTag('docker:containers')
		updateTag('docker:images')
		updateTag('docker:connection')
		// Also expire cached Docker Hub / GHCR responses (1h fetch cache)
		updateTag('registry:checks')
	}

	return (
		<div className='flex-1 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<div className='flex flex-col gap-2'>
					{/* Fila superior: título + acciones */}
					<div className='flex items-start justify-between'>
						<h1 className='text-4xl font-bold tracking-tight text-foreground'>
							{dict.dashboard.title}
						</h1>

						{/* Acciones */}
						<div className='flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-3'>
							{authEnabled && (
								<form action={logout} noValidate>
									<LogoutButton
										variant='outline'
										size='icon'
										showIcon
										ariaLabel={dict.login.logout}
										className='md:hidden'
									/>
									<LogoutButton
										variant='outline'
										showIcon
										className='hidden md:flex'
									>
										{dict.login.logout}
									</LogoutButton>
								</form>
							)}

							<form action={refresh} noValidate>
								<RefreshButton />
							</form>
						</div>
					</div>

					{/* Fila inferior: descripción */}
					<p className='text-muted-foreground'>{dict.dashboard.description}</p>
				</div>

				<Suspense
					fallback={
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
					}
				>
					<DashboardContent locale={locale} />
				</Suspense>
			</div>
		</div>
	)
}
