import { LogOut } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkAuth, logout } from '@/actions/auth'
import { checkImageUpdate, getContainers, getImages } from '@/actions/docker'
import { ContainerDashboard } from '@/components/container-dashboard'
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
	const dict = await getDictionary(locale)
	const containers = await getContainers()
	const images = await getImages()
	const authEnabled = !!process.env.AUTH_HTPASSWD

	async function refresh() {
		'use server'
		revalidatePath('/')
	}

	const processedContainers = await Promise.all(
		containers.map(async (container) => {
			const isRunning = container.State === 'running'
			const ports = (container.Ports || [])
				.map((p) => `${p.PrivatePort}:${p.PublicPort}`)
				.join(', ')

			// Find local image details to get RepoDigests
			const localImage = images.find((img) => img.Id === container.ImageID)
			const localDigests = localImage?.RepoDigests || []

			// Find local digest (search in RepoDigests first)
			let localDigest = localImage?.RepoDigests?.[0]?.split('@')[1]
			// Fallback to ImageID if no repo digest
			if (!localDigest && container.ImageID) {
				localDigest = container.ImageID
			}

			// Check for updates with local digest awareness
			const {
				latestDigest,
				lastUpdated,
				currentVersion,
				latestVersion,
				dockerHubUrl,
				isLocal
			} = await checkImageUpdate(container.Image, localDigest)

			// Fallback: If we couldn't resolve a semantic version, use the tag from the image string if available
			const imageTag = container.Image.split(':')[1] || 'latest'
			const displayCurentVersion =
				currentVersion && currentVersion !== 'Unknown'
					? currentVersion
					: imageTag

			let updateStatus: 'updated' | 'available' | 'unknown' | 'local' =
				'unknown'
			let isUpToDate = false

			if (isLocal) {
				updateStatus = 'local'
			} else if (latestDigest) {
				isUpToDate = localDigests.some((digest) =>
					digest.includes(latestDigest)
				)
				updateStatus = isUpToDate ? 'updated' : 'available'
			}

			const containerName = container.Names?.[0]?.replace('/', '') || 'Unnamed'

			return {
				container,
				isRunning,
				ports,
				updateStatus,
				containerName,
				currentVersion,
				displayCurentVersion,
				latestVersion,
				lastUpdated,
				dockerHubUrl,
				isUpToDate
			}
		})
	)

	const stats = {
		updated: processedContainers.filter((c) => c.updateStatus === 'updated')
			.length,
		available: processedContainers.filter((c) => c.updateStatus === 'available')
			.length,
		unknown: processedContainers.filter(
			(c) => c.updateStatus === 'unknown' || c.updateStatus === 'local'
		).length
	}

	return (
		<div className='min-h-dvh bg-neutral-950 text-neutral-50 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<div className='flex flex-col gap-2'>
					{/* Fila superior: título + acciones */}
					<div className='flex items-start justify-between'>
						<h1 className='text-4xl font-bold tracking-tight text-white'>
							{dict.dashboard.title}
						</h1>

						{/* Acciones */}
						<div className='flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-3'>
							{authEnabled && (
								<form action={logout}>
									<Button
										variant='outline'
										size='icon'
										className='bg-neutral-800 hover:bg-neutral-700 text-white rounded-[3.5px] border-neutral-700 flex items-center gap-2 md:hidden'
									>
										<LogOut className='h-4 w-4' />
									</Button>
									<Button
										variant='outline'
										className='bg-neutral-800 hover:bg-neutral-700 text-white rounded-[3.5px] border-neutral-700 items-center gap-2 hidden md:flex'
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
					<p className='text-neutral-400'>{dict.dashboard.description}</p>
				</div>

				<ContainerDashboard
					processedContainers={processedContainers}
					stats={stats}
					dict={dict}
					locale={locale}
				/>

				{containers.length === 0 && (
					<div className='text-center py-20 text-neutral-500'>
						{dict.dashboard.noContainers}
					</div>
				)}
			</div>
		</div>
	)
}
