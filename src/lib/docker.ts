import Docker from 'dockerode'

// Use a singleton pattern to avoid creating multiple connections in dev mode
let docker: Docker

if (process.env.DOCKER_HOST) {
	// Support for TCP connection (e.g. via docker-socket-proxy)
	const hostUrl = new URL(process.env.DOCKER_HOST)
	docker = new Docker({
		host: hostUrl.hostname,
		port: hostUrl.port || '2375'
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
