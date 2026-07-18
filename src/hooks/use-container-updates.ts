'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
	saveAllContainersCacheAction,
	updateContainerCacheAction
} from '@/actions/container-cache'
import {
	checkImagesUpdatesBatch,
	updateContainerImage,
	verifyContainerUpdate
} from '@/actions/docker'
import { dispatchLoading } from '@/components/loading-events'
import type { ContainersCache } from '@/lib/cache/containers'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import type { PolicyState } from '@/lib/policies/types'
import type { FilterStatus } from '@/types/app-state'

export interface ReferenceUrlData {
	image: string
	referenceUrl: string
}

export interface ContainerData {
	container: {
		Id: string
		State: string
		Image: string
		ImageID: string
		Status: string
		Names: string[]
	}
	isRunning: boolean
	ports: string
	updateStatus: FilterStatus | 'local'
	containerName: string
	currentVersion?: string
	displayCurrentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
	policyState?: PolicyState
	localDigest?: string
	/** true = loaded from cache, will refresh silently in the background */
	isStale?: boolean
}

export function useContainerUpdates(
	processedContainers: ContainerData[],
	dict: Dictionary
) {
	const [containers, setContainers] =
		useState<ContainerData[]>(processedContainers)
	const [checkProgress, setCheckProgress] = useState<{
		current: number
		total: number
	}>({ current: 0, total: 0 })

	const [updatingContainerId, setUpdatingContainerId] = useState<string | null>(
		null
	)
	const [updateError, setUpdateError] = useState<string | null>(null)

	// Sync loading state with event for the refresh button
	const isLoading = checkProgress.total > 0

	useEffect(() => {
		dispatchLoading(isLoading)
	}, [isLoading])

	// Sync containers state with props when they change
	useEffect(() => {
		setContainers(processedContainers)
	}, [processedContainers])

	// Progressive Background Fetch for container updates
	useEffect(() => {
		let isCancelled = false

		const fetchUpdates = async () => {
			const finalCache: ContainersCache = {}

			// Collect containers that need checking
			const containersToCheck = processedContainers.filter(
				(containerData) =>
					containerData.updateStatus === 'checking' || containerData.isStale
			)
			const itemsToProcess = containersToCheck.length

			if (itemsToProcess > 0) {
				setCheckProgress({ current: 0, total: itemsToProcess })
			}

			// Build final cache for non-checking containers first
			for (const containerData of processedContainers) {
				const cacheKey = containerData.localDigest
					? `${containerData.container.Image}::${containerData.localDigest}`
					: null

				if (
					cacheKey &&
					containerData.localDigest &&
					containerData.updateStatus !== 'local' &&
					containerData.updateStatus !== 'unknown' &&
					containerData.updateStatus !== 'checking' &&
					!containerData.isStale
				) {
					finalCache[cacheKey] = {
						imageName: containerData.container.Image,
						localDigest: containerData.localDigest,
						updateStatus: containerData.updateStatus as
							| 'updated'
							| 'available'
							| 'unknown',
						currentVersion: containerData.currentVersion,
						displayCurrentVersion: containerData.displayCurrentVersion,
						latestVersion: containerData.latestVersion,
						lastUpdated: containerData.lastUpdated,
						dockerHubUrl: containerData.dockerHubUrl,
						isUpToDate: containerData.isUpToDate,
						policyState: containerData.policyState,
						cachedAt: new Date().toISOString()
					}
				}
			}

			// Fetch all updates in parallel with progress tracking
			let completed = 0
			const total = containersToCheck.length

			const updateResults = await checkImagesUpdatesBatch(
				containersToCheck.map((containerData) => ({
					containerId: containerData.container.Id,
					imageName: containerData.container.Image,
					localDigest: containerData.localDigest
				}))
			)

			for (const result of updateResults) {
				const containerData = containersToCheck.find(
					(item) => item.container.Id === result.containerId
				)
				if (!containerData) continue
				try {
					if (result.error) {
						throw new Error(result.error)
					}

					const {
						hasUpdate,
						latestDigest,
						lastUpdated,
						currentVersion,
						latestVersion,
						dockerHubUrl,
						isLocal,
						policyResult
					} = result

					const imageTag =
						containerData.container.Image.split(':')[1] || 'latest'
					const displayCurrentVersionStr =
						currentVersion && currentVersion !== 'Unknown'
							? currentVersion
							: imageTag

					let updateStatus: FilterStatus | 'local' = 'unknown'
					if (isLocal) {
						updateStatus = 'local'
					} else if (latestDigest) {
						updateStatus = hasUpdate ? 'available' : 'updated'
					}

					const cacheKey = containerData.localDigest
						? `${containerData.container.Image}::${containerData.localDigest}`
						: null

					if (
						cacheKey &&
						containerData.localDigest &&
						updateStatus !== 'local'
					) {
						finalCache[cacheKey] = {
							imageName: containerData.container.Image,
							localDigest: containerData.localDigest,
							updateStatus: updateStatus as 'updated' | 'available' | 'unknown',
							currentVersion,
							displayCurrentVersion: displayCurrentVersionStr,
							latestVersion,
							lastUpdated,
							dockerHubUrl,
							isUpToDate: !hasUpdate,
							policyState: policyResult?.state,
							cachedAt: new Date().toISOString()
						}
					}
				} catch (error) {
					console.error(
						`Failed to process update for ${containerData.container.Image}`,
						error
					)
				} finally {
					completed++
					if (!isCancelled && total > 0) {
						setCheckProgress({ current: completed, total })
					}
				}
			}

			const normalizedUpdateResults = updateResults.map((result) => {
				const containerData = containersToCheck.find(
					(item) => item.container.Id === result.containerId
				)
				if (!containerData) {
					return {
						containerId: result.containerId,
						error: result.error || 'Container not found'
					}
				}

				if (result.error) {
					return {
						containerId: result.containerId,
						error: result.error
					}
				}

				const imageTag = containerData.container.Image.split(':')[1] || 'latest'
				const displayCurrentVersionStr =
					result.currentVersion && result.currentVersion !== 'Unknown'
						? result.currentVersion
						: imageTag

				let updateStatus: FilterStatus | 'local' = 'unknown'
				if (result.isLocal) {
					updateStatus = 'local'
				} else if (result.latestDigest) {
					updateStatus = result.hasUpdate ? 'available' : 'updated'
				}

				return {
					containerId: result.containerId,
					updateStatus,
					currentVersion: result.currentVersion,
					displayCurrentVersion: displayCurrentVersionStr,
					latestVersion: result.latestVersion,
					lastUpdated: result.lastUpdated,
					dockerHubUrl: result.dockerHubUrl,
					isUpToDate: !result.hasUpdate,
					policyState: result.policyResult?.state,
					isStale: false,
					error: null
				}
			})

			const resultsByContainerId = new Map(
				normalizedUpdateResults
					.filter((result) => result?.containerId)
					.map((result) => [result.containerId, result] as const)
			)

			// Apply all updates in a single state update
			setContainers((prev) => {
				return prev.map((container) => {
					const result = resultsByContainerId.get(container.container.Id)

					if (!result) return container

					if (result.error) {
						// On error, only change 'checking' containers to 'unknown'
						if (container.updateStatus === 'checking') {
							return { ...container, updateStatus: 'unknown' as FilterStatus }
						}
						return container
					}

					return {
						...container,
						updateStatus: result.updateStatus as FilterStatus,
						currentVersion: result.currentVersion ?? container.currentVersion,
						displayCurrentVersion:
							result.displayCurrentVersion ?? container.displayCurrentVersion,
						latestVersion: result.latestVersion ?? container.latestVersion,
						lastUpdated: result.lastUpdated ?? container.lastUpdated,
						dockerHubUrl: result.dockerHubUrl ?? container.dockerHubUrl,
						isUpToDate: result.isUpToDate ?? container.isUpToDate,
						policyState: result.policyState ?? container.policyState,
						isStale: result.isStale ?? container.isStale
					}
				})
			})

			// All instances checked, save the cache back to the server
			if (!isCancelled && Object.keys(finalCache).length > 0) {
				try {
					await saveAllContainersCacheAction(finalCache)
					console.log(
						'[Cache] Successfully synchronized container cache to server'
					)
				} catch (error) {
					console.error(
						'[Cache] Failed to synchronize container cache to server',
						error
					)
				}
			}

			if (!isCancelled) {
				// Wait a bit so user sees 100%
				setTimeout(() => {
					if (!isCancelled) setCheckProgress({ current: 0, total: 0 })
				}, 1000)
			}
		}

		fetchUpdates()

		return () => {
			isCancelled = true
		}
	}, [processedContainers])

	const handleUpdateClick = async (
		containerId: string,
		containerImage: string,
		newVersion: string
	) => {
		setUpdatingContainerId(containerId)
		setUpdateError(null)

		const imageName = containerImage.includes(':')
			? `${containerImage.split(':')[0]}:${newVersion}`
			: `${containerImage}:${newVersion}`

		const containerName =
			containers.find((c) => c.container.Id === containerId)?.containerName ||
			containerId.substring(0, 12)

		try {
			const result = await updateContainerImage(containerId, imageName)

			if (result.success) {
				// Verify if there's still an update available after the upgrade
				const updateInfo = await verifyContainerUpdate(imageName)

				// Determine update status based on verification result
				const newStatus = updateInfo.hasUpdate ? 'available' : 'updated'
				const latestVersion = updateInfo.latestVersion || newVersion

				// Use the new container ID if available (container was recreated)
				const updatedContainerId = result.newContainerId || containerId

				setContainers((prev) =>
					prev.map((c) =>
						c.container.Id === containerId
							? {
									...c,
									displayCurrentVersion: newVersion,
									currentVersion: newVersion,
									latestVersion: latestVersion,
									isUpToDate: !updateInfo.hasUpdate,
									updateStatus: newStatus as FilterStatus,
									dockerHubUrl: updateInfo.dockerHubUrl,
									policyState: updateInfo.policyState,
									container: {
										...c.container,
										Id: updatedContainerId,
										Image: imageName
									}
								}
							: c
					)
				)

				// Update the cache with the new container info
				if (updateInfo.localDigest) {
					updateContainerCacheAction(imageName, updateInfo.localDigest, {
						displayCurrentVersion: newVersion,
						currentVersion: newVersion,
						latestVersion: latestVersion,
						isUpToDate: !updateInfo.hasUpdate,
						updateStatus: newStatus,
						dockerHubUrl: updateInfo.dockerHubUrl,
						policyState: updateInfo.policyState,
						lastUpdated: new Date().toISOString()
					}).catch((err) => {
						console.error('[Cache] Failed to update container cache:', err)
					})
				}

				toast.success(
					dict.toast.updateSuccess
						.replace('{container}', containerName)
						.replace('{version}', newVersion)
				)
			} else {
				setUpdateError(result.error || 'Unknown error')
				setTimeout(() => setUpdateError(null), 5000)
				toast.error(
					dict.toast.updateError.replace('{container}', containerName)
				)
			}
		} catch (err) {
			setUpdateError(err instanceof Error ? err.message : 'Unknown error')
			setTimeout(() => setUpdateError(null), 5000)
			toast.error(dict.toast.updateError.replace('{container}', containerName))
		} finally {
			setUpdatingContainerId(null)
		}
	}

	return {
		containers,
		checkProgress,
		updatingContainerId,
		updateError,
		handleUpdateClick
	}
}
