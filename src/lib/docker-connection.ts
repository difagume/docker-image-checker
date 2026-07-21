/**
 * Server-side helpers to describe how the app is connected to the Docker
 * daemon, so the UI can surface a subtle "remote server" indicator.
 *
 * This only reads environment variables (never opens a connection), mirroring
 * the resolution logic in `src/lib/docker.ts`.
 */

export type DockerConnectionType = 'local' | 'ssh' | 'tls' | 'tcp'

export interface DockerConnectionInfo {
	/** Whether the daemon is reached over the network (not the local socket). */
	isRemote: boolean
	/** How the connection is established. */
	type: DockerConnectionType
	/** Human-friendly host to display (e.g. "user@host" or "host:2376"). */
	host: string | null
}

const LOCAL_INFO: DockerConnectionInfo = {
	isRemote: false,
	type: 'local',
	host: null
}

function hasInlineTls(): boolean {
	return Boolean(
		process.env.DOCKER_TLS_CA?.trim() ||
			process.env.DOCKER_TLS_CERT?.trim() ||
			process.env.DOCKER_TLS_KEY?.trim()
	)
}

function usesTls(protocol: string, port: string): boolean {
	if (protocol === 'https:') return true
	const verify = process.env.DOCKER_TLS_VERIFY?.trim().toLowerCase()
	if (verify === '1' || verify === 'true') return true
	if (process.env.DOCKER_CERT_PATH?.trim()) return true
	if (hasInlineTls()) return true
	// The conventional TLS port for the Docker daemon.
	return port === '2376'
}

/**
 * Describes the current Docker connection based on `DOCKER_HOST` (and related
 * TLS variables). Returns a "local" descriptor when no remote host is set or
 * when the value points at a local socket / named pipe.
 */
export function getDockerConnectionInfo(): DockerConnectionInfo {
	const dockerHost = process.env.DOCKER_HOST?.trim()

	if (!dockerHost) {
		return LOCAL_INFO
	}

	if (dockerHost.startsWith('unix://') || dockerHost.startsWith('npipe://')) {
		return LOCAL_INFO
	}

	let url: URL
	try {
		url = new URL(dockerHost)
	} catch {
		// Not a parseable URL — treat it as an opaque remote host.
		return { isRemote: true, type: 'tcp', host: dockerHost }
	}

	const hostname = url.hostname
	const port = url.port
	const hostWithPort = port ? `${hostname}:${port}` : hostname

	if (url.protocol === 'ssh:') {
		const user = url.username ? `${url.username}@` : ''
		return { isRemote: true, type: 'ssh', host: `${user}${hostname}` }
	}

	if (usesTls(url.protocol, port)) {
		return { isRemote: true, type: 'tls', host: hostWithPort }
	}

	return { isRemote: true, type: 'tcp', host: hostWithPort }
}
