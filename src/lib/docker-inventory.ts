import type { ContainerInfo, ImageInfo } from 'dockerode'
import { cacheLife, cacheTag } from 'next/cache'
import {
	CACHE_TAGS,
	CONNECTION_CACHE_PROFILE,
	INVENTORY_CACHE_PROFILE
} from '@/lib/cache-tags'
import docker from '@/lib/docker'

// ── Raw readers (always fresh, throw on error) ────────────────

/**
 * Lists all Docker containers by querying the daemon directly.
 * Throws on error — callers must handle failures.
 */
export async function listContainersRaw(): Promise<ContainerInfo[]> {
	const containers = await docker.listContainers({ all: true })
	// Detach from dockerode's response buffer so cached scopes never hold a
	// reference to mutable daemon state
	return structuredClone(containers)
}

/**
 * Lists all Docker images by querying the daemon directly.
 * Throws on error — callers must handle failures.
 */
export async function listImagesRaw(): Promise<ImageInfo[]> {
	const images = await docker.listImages()
	return structuredClone(images)
}

/**
 * Pings the Docker daemon to verify connectivity.
 * Throws on error — callers must handle failures.
 */
export async function pingDockerRaw(): Promise<boolean> {
	await docker.ping()
	return true
}

/**
 * Compact projection of the daemon's `docker info` payload used by the host
 * panel. Only the fields the UI shows — the full SystemInfo carries ~100 keys
 * we neither render nor want leaking into cached scopes.
 */
export interface DockerHostInfo {
	name: string
	serverVersion: string
	operatingSystem: string
	osType: string
	architecture: string
	kernelVersion: string
	storageDriver: string
	dockerRootDir: string
	cpus: number
	memTotal: number
	containers: {
		total: number
		running: number
		paused: number
		stopped: number
	}
	images: number
}

/**
 * Reads the daemon's global info (`docker info`). Throws on error — callers
 * must handle failures.
 */
export async function getDockerHostInfoRaw(): Promise<DockerHostInfo> {
	const info = await docker.info()
	return {
		name: info.Name ?? '',
		serverVersion: info.ServerVersion ?? '',
		operatingSystem: info.OperatingSystem ?? '',
		osType: info.OSType ?? '',
		architecture: info.Architecture ?? '',
		kernelVersion: info.KernelVersion ?? '',
		storageDriver: info.Driver ?? '',
		dockerRootDir: info.DockerRootDir ?? '',
		cpus: info.NCPU ?? 0,
		memTotal: info.MemTotal ?? 0,
		containers: {
			total: info.Containers ?? 0,
			running: info.ContainersRunning ?? 0,
			paused: info.ContainersPaused ?? 0,
			stopped: info.ContainersStopped ?? 0
		},
		images: info.Images ?? 0
	}
}

// ── Cached wrappers (stale-while-revalidate via Cache Components) ──

/**
 * Returns the cached container list. On cache miss or expiry, re-scans the
 * daemon (stale 5min / revalidate 1min / expire 1h). Throws on error — the
 * cache never stores error states.
 */
export async function getContainers(): Promise<ContainerInfo[]> {
	'use cache'
	cacheLife(INVENTORY_CACHE_PROFILE)
	cacheTag(CACHE_TAGS.containers)
	return listContainersRaw()
}

/**
 * Returns the cached image list. On cache miss or expiry, re-scans the daemon
 * (stale 5min / revalidate 1min / expire 1h). Throws on error — the cache
 * never stores error states.
 */
export async function getImages(): Promise<ImageInfo[]> {
	'use cache'
	cacheLife(INVENTORY_CACHE_PROFILE)
	cacheTag(CACHE_TAGS.images)
	return listImagesRaw()
}

/**
 * Returns the cached host info. On cache miss or expiry, re-queries the
 * daemon (stale 5min / revalidate 1min / expire 1h). Throws on error — the
 * cache never stores error states.
 */
export async function getDockerHostInfo(): Promise<DockerHostInfo> {
	'use cache'
	cacheLife(INVENTORY_CACHE_PROFILE)
	cacheTag(CACHE_TAGS.host)
	return getDockerHostInfoRaw()
}

/**
 * Returns the cached daemon connectivity status (stale 30s / revalidate 1s /
 * expire 1min — short-lived, excluded from prerenders). Throws on error — the
 * cache never stores error states.
 */
export async function getDockerConnected(): Promise<boolean> {
	'use cache'
	cacheLife(CONNECTION_CACHE_PROFILE)
	cacheTag(CACHE_TAGS.connection)
	return pingDockerRaw()
}
