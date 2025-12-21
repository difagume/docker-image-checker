import { RefreshCcw } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { checkImageUpdate, getContainers, getImages } from '@/actions/docker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
	const containers = await getContainers()
	const images = await getImages()

	async function refresh() {
		'use server'
		revalidatePath('/')
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
							className='bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
						>
							<RefreshCcw className='h-4 w-4' />
						</Button>
					</form>
				</div>

				<div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
					{
						await Promise.all(
							containers.map(async (container) => {
								const isRunning = container.State === 'running'
								const ports = (container.Ports || [])
									.map((p) => `${p.PrivatePort}:${p.PublicPort}`)
									.join(', ')

								// Find local image details to get RepoDigests
								const localImage = images.find(
									(img) => img.Id === container.ImageID
								)
								const localDigests = localImage?.RepoDigests || []

								// Determine if truly updated
								let updateStatusNode = (
									<span className='text-neutral-500'>Unknown</span>
								)
								let logUpdateStatus = 'Unknown'

								// Find local digest (search in RepoDigests first)
								let localDigest = localImage?.RepoDigests?.[0]?.split('@')[1]
								// Fallback to ImageID if no repo digest (though ImageID is local ID, not always reliable for remote compare unless pushed)
								if (!localDigest && container.ImageID) {
									// ImageID is typically sha256:...
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

								if (latestDigest) {
									const isUpToDate = localDigests.some((digest) =>
										digest.includes(latestDigest)
									)

									if (isUpToDate) {
										updateStatusNode = (
											<div className='flex flex-col items-end'>
												<span className='text-green-500 font-medium'>
													Actualizado
												</span>
												<span className='text-xs text-neutral-600'>
													{displayCurentVersion}
												</span>
											</div>
										)
										logUpdateStatus = 'Actualizado'
									} else {
										const remoteDate = lastUpdated
											? new Date(lastUpdated).toLocaleDateString('es-ES')
											: 'N/A'
										const displayLatestVersion =
											latestVersion !== 'latest' && latestVersion !== 'Unknown'
												? latestVersion
												: 'latest'

										logUpdateStatus = `Actualización disponible (Remoto: ${displayLatestVersion} el ${remoteDate})`

										updateStatusNode = (
											<div className='flex flex-col items-end'>
												{dockerHubUrl ? (
													<a
														href={dockerHubUrl}
														target='_blank'
														rel='noopener noreferrer'
														className='text-amber-500 font-bold hover:underline hover:text-amber-400'
														title='Ver en Docker Hub'
													>
														Actualización disponible
													</a>
												) : (
													<span className='text-amber-500 font-bold'>
														Actualización disponible
													</span>
												)}
												<div className='flex flex-col text-right'>
													<span className='text-xs text-neutral-400'>
														Disponible: {displayLatestVersion}
													</span>
													<span className='text-[10px] text-neutral-500'>
														Actualizado: {remoteDate}
													</span>
												</div>
											</div>
										)
									}
								}

								// Show local version details
								const localDisplayVersion =
									currentVersion !== 'Unknown'
										? currentVersion
										: localDigest
											? localDigest.substring(7, 19) + '...'
											: imageTag
								const localCreated = new Date(
									container.Created * 1000
								).toLocaleDateString()

								const containerName =
									container.Names?.[0]?.replace('/', '') || 'Unnamed'

								/* console.log(
									JSON.stringify(
										{
											Name: containerName,
											State: container.State,
											Image:
												container.Image +
												(currentVersion !== 'Unknown'
													? ` (${currentVersion})`
													: ''),
											ID: container.Id.substring(0, 12),
											LocalDigest: localDigest
												? localDigest.substring(7, 19) + '...'
												: 'N/A',
											Version: localDisplayVersion,
											Created: localCreated,
											Ports: ports || 'N/A',
											Status: container.Status,
											Update: logUpdateStatus
										},
										null,
										2
									)
								) */

								const hasUpdateAvailable = logUpdateStatus.includes('Actualización disponible')

									return (
										<Card
											key={container.Id}
											className={`bg-neutral-900 border-neutral-800 text-neutral-50 ${hasUpdateAvailable ? 'border-l-amber-500' : ''}`}
										>
											<CardHeader className='pb-2'>
											<div className='flex justify-between items-start'>
												<CardTitle className='text-lg font-medium text-white max-w-[260px]'>
													{containerName}
												</CardTitle>
												<Badge
													variant='outline'
													className={
														isRunning
															? 'bg-transparent text-green-500 border-green-500 font-mono rounded-[3.5px] cursor-default'
															: 'bg-transparent text-red-500 border-red-500 font-mono rounded-[3.5px] cursor-default'
													}
												>
													{container.State}
												</Badge>
											</div>
											<CardDescription className='text-neutral-400 truncate'>
												{container.Image}
												{currentVersion && currentVersion !== 'Unknown' && (
													<span className='ml-2 text-xs text-neutral-500 font-mono'>
														({currentVersion})
													</span>
												)}
											</CardDescription>
											<div className='text-xs text-neutral-500 font-mono mt-1'>
												ID: {container.ImageID.substring(7, 19)}...
											</div>
										</CardHeader>
										<CardContent>
											<div className='space-y-2 text-sm text-neutral-300'>
												<div className='flex justify-between'>
													<span className='text-neutral-500'>ID:</span>
													<span className='font-mono'>
														{container.Id.substring(0, 12)}
													</span>
												</div>
												<div className='flex justify-between'>
													<span className='text-neutral-500'>Ports:</span>
													<span className='font-mono truncate max-w-[150px]'>
														{ports || 'N/A'}
													</span>
												</div>
												<div className='flex justify-between'>
													<span className='text-neutral-500'>Status:</span>
													<span>{container.Status}</span>
												</div>
												<div className='flex justify-between items-start pt-2 border-t border-neutral-800 mt-2'>
													<div className='flex flex-col'>
														<span className='text-neutral-500 pt-0.5'>
															Imagen:
														</span>
														{currentVersion && currentVersion !== 'Unknown' && (
															<span className='text-[10px] text-neutral-400 font-mono'>
																{currentVersion}
															</span>
														)}
													</div>
													{updateStatusNode}
												</div>

												<details className='mt-2 border-t border-neutral-800 pt-2'>
													<summary className='cursor-pointer text-xs text-neutral-500 hover:text-neutral-300'>
														Depurar JSON
													</summary>
													<pre className='text-[10px] bg-black p-2 rounded overflow-auto mt-1 max-h-40 font-mono text-neutral-400'>
														{JSON.stringify(container, null, 2)}
													</pre>
												</details>
											</div>
										</CardContent>
									</Card>
								)
							})
						)
					}
				</div>

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
