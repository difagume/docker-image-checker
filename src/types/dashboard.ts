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
	ghcrError?: 'invalid_token'
}
