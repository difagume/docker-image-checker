import { LogOut } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { checkAuth, logout } from '@/actions/auth'
import { DashboardContent } from '@/components/dashboard-content'
import { RefreshButton } from '@/components/refresh-button'
import { Button } from '@/components/ui/button'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
	if (process.env.AUTH_HTPASSWD) {
		const auth = await checkAuth()
		if (!auth.authenticated) redirect('/login')
	}

	const locale = await getLocale()
	const dict = getDictionary(locale)
	const authEnabled = !!process.env.AUTH_HTPASSWD

	async function refresh() {
		'use server'
		revalidatePath('/')
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
								<form action={logout}>
								<Button
									variant='outline'
									size='icon'
									className='hover:bg-neutral-700! hover:text-neutral-950 hover:border-neutral-700! flex items-center gap-2 md:hidden'
									aria-label={dict.login.logout}
								>
									<LogOut className='h-4 w-4' />
									</Button>
									<Button
										variant='outline'
										className='hover:bg-neutral-700! hover:text-neutral-950 hover:border-neutral-700! items-center gap-2 hidden md:flex'
									>
										<LogOut className='h-4 w-4' />
										{dict.login.logout}
									</Button>
								</form>
							)}

							<form action={refresh}>
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
									className='rounded-lg border border-border bg-muted/50 p-6 animate-pulse'
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
					}
				>
					<DashboardContent locale={locale} />
				</Suspense>
			</div>
		</div>
	)
}
