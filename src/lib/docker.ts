import Docker from 'dockerode'

let docker: Docker

function parseDockerHost(): { host: string; port: string } | null {
	const dockerHost = process.env.DOCKER_HOST

	if (!dockerHost) {
		return null
	}

	try {
		const url = new URL(dockerHost)

		if (url.protocol !== 'tcp:') {
			throw new Error(
				`Unsupported protocol: ${url.protocol}. Only 'tcp://' is supported.`
			)
		}

		if (!url.hostname) {
			throw new Error('Invalid hostname in DOCKER_HOST')
		}

		return {
			host: url.hostname,
			port: url.port || '2375'
		}
	} catch (error) {
		console.error(
			'Invalid DOCKER_HOST configuration:',
			error instanceof Error ? error.message : error
		)
		return null
	}
}

const dockerHostConfig = parseDockerHost()

if (dockerHostConfig) {
	docker = new Docker({
		host: dockerHostConfig.host,
		port: dockerHostConfig.port
	})
} else if (process.env.NODE_ENV === 'production') {
	docker = new Docker({ socketPath: '/var/run/docker.sock' })
} else {
	if (!(global as any).docker) {
		const isWindows = process.platform === 'win32'
		const socketPath = isWindows
			? '//./pipe/docker_engine'
			: '/var/run/docker.sock'
		;(global as any).docker = new Docker({ socketPath })
	}
	docker = (global as any).docker
}

export default docker
