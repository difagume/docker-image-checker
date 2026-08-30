import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { checkAuth, logout } from '@/actions/auth'
import { DashboardContent } from '@/components/dashboard-content'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { LogoutButton } from '@/components/logout-button'
import { RefreshButton } from '@/components/refresh-button'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

/**
 * Auth + locale gate for `/`. Runs inside the static shell's Suspense so the
 * shell never touches cookies/headers; the proxy is the primary barrier and
 * this redirect is defense-in-depth. Renders the FULL localized header (the
 * static shell is header-less — OQ-2) and a nested Suspense so the daemon data
 * does not block the header.
 */
export async function DashboardGate() {
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
		for (const tag of REFRESH_TAGS) {
			updateTag(tag)
		}
	}

	return (
		<>
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
							<RefreshButton
								strings={{
									refreshAriaLabel: dict.dashboard.refreshAriaLabel,
									refreshing: dict.dashboard.refreshing,
									upToDate: dict.dashboard.upToDate
								}}
							/>
						</form>
					</div>
				</div>

				{/* Fila inferior: descripción */}
				<p className='text-muted-foreground'>{dict.dashboard.description}</p>
			</div>

			{/* Nested Suspense: the header does not wait for the daemon data */}
			<Suspense fallback={<DashboardSkeleton />}>
				<DashboardContent locale={locale} />
			</Suspense>
		</>
	)
}
