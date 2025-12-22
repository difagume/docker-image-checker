import { RefreshCcw } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { checkImageUpdate, getContainers, getImages } from '@/actions/docker'
import { ContainerDashboard } from '@/components/container-dashboard'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
	const containers = await getContainers()
	const images = await getImages()

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
				dockerHubUrl
			} = await checkImageUpdate(container.Image, localDigest)

			// Fallback: If we couldn't resolve a semantic version, use the tag from the image string if available
			const imageTag = container.Image.split(':')[1] || 'latest'
			const displayCurentVersion =
				currentVersion && currentVersion !== 'Unknown'
					? currentVersion
					: imageTag

			let updateStatus: 'updated' | 'available' | 'unknown' = 'unknown'
			let isUpToDate = false

			if (latestDigest) {
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
		unknown: processedContainers.filter((c) => c.updateStatus === 'unknown')
			.length
	}

	return (
		<div className='min-h-screen bg-neutral-950 text-neutral-50 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<div className='flex justify-between items-center'>
					<div>
						<h1 className='text-4xl font-bold tracking-tight text-white mb-2'>
							Panel de Contenedores Docker
						</h1>
						<p className='text-neutral-400'>
							Monitorea tus contenedores y el estado de sus imágenes.
						</p>
					</div>
					<form action={refresh}>
						<Button
							variant='secondary'
							size='icon'
							className='bg-neutral-800 hover:bg-neutral-700 text-white rounded-[3.5px] border-neutral-700'
						>
							<RefreshCcw className='h-4 w-4' />
						</Button>
					</form>
				</div>

				<ContainerDashboard
					processedContainers={processedContainers}
					stats={stats}
				/>

				{containers.length === 0 && (
					<div className='text-center py-20 text-neutral-500'>
						No se encontraron contenedores. Asegúrate de que Docker esté
						ejecutándose y el socket sea accesible.
					</div>
				)}
			</div>
		</div>
	)
}
