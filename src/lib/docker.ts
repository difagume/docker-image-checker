import { readFileSync } from 'node:fs'
import Docker from 'dockerode'

type DockerConnectionOptions = NonNullable<
	ConstructorParameters<typeof Docker>[0]
>

let docker: Docker

/**
 * Reads TLS/SSH key material from inline environment content or from a file
 * path. Inline values support `\n`-escaped newlines so that multiline PEM data
 * can be stored in a single environment variable (useful in .env files and
 * container orchestrators).
 */
function readKeyMaterial(
	inline: string | undefined,
	filePath: string | undefined,
	label: string
): Buffer | undefined {
	if (inline?.trim()) {
		return Buffer.from(inline.replace(/\\n/g, '\n'))
	}

	if (filePath?.trim()) {
		try {
			return readFileSync(filePath)
		} catch (error) {
			console.error(
				`Could not read ${label} from "${filePath}":`,
				error instanceof Error ? error.message : error
			)
		}
	}

	return undefined
}

/**
 * Reads TLS material provided inline through environment variables
 * (DOCKER_TLS_CA / DOCKER_TLS_CERT / DOCKER_TLS_KEY). The standard
 * DOCKER_CERT_PATH directory (ca.pem/cert.pem/key.pem) is handled natively by
 * docker-modem, so it is intentionally not read here.
 */
function loadInlineTlsMaterial(): { ca?: Buffer; cert?: Buffer; key?: Buffer } {
	return {
		ca: readKeyMaterial(process.env.DOCKER_TLS_CA, undefined, 'TLS CA'),
		cert: readKeyMaterial(process.env.DOCKER_TLS_CERT, undefined, 'TLS cert'),
		key: readKeyMaterial(process.env.DOCKER_TLS_KEY, undefined, 'TLS key')
	}
}

/**
 * Loads the SSH private key (and optional passphrase) used to authenticate the
 * remote Docker daemon connection, from environment variables.
 */
function loadSshKey(): { privateKey?: Buffer; passphrase?: string } {
	return {
		privateKey: readKeyMaterial(
			process.env.DOCKER_SSH_KEY,
			process.env.DOCKER_SSH_KEY_FILE,
			'SSH private key'
		),
		passphrase: process.env.DOCKER_SSH_KEY_PASSPHRASE || undefined
	}
}

/**
 * Builds the extra dockerode options needed to reach a remote daemon.
 *
 * Host parsing (tcp://, https://, ssh://, unix://, npipe://), the standard
 * DOCKER_TLS_VERIFY / DOCKER_CERT_PATH variables and the SSH agent are handled
 * natively by docker-modem from `DOCKER_HOST`. This function only supplements
 * the pieces docker-modem cannot resolve on its own:
 *   - SSH: the private key / passphrase (docker-modem only wires SSH_AUTH_SOCK).
 *   - TLS: certificate material provided inline via environment variables.
 *
 * Returns null when DOCKER_HOST is not set so the caller falls back to the
 * local socket / named pipe.
 */
function buildRemoteOptions(): DockerConnectionOptions | null {
	const dockerHost = process.env.DOCKER_HOST?.trim()

	if (!dockerHost) {
		return null
	}

	if (dockerHost.startsWith('ssh://')) {
		const { privateKey, passphrase } = loadSshKey()

		if (!privateKey && !process.env.SSH_AUTH_SOCK) {
			console.warn(
				'DOCKER_HOST uses ssh:// but no SSH key was provided ' +
					'(DOCKER_SSH_KEY / DOCKER_SSH_KEY_FILE) and SSH_AUTH_SOCK is not set. ' +
					'The connection will likely fail.'
			)
		}

		return {
			sshOptions: {
				...(privateKey ? { privateKey } : {}),
				...(passphrase ? { passphrase } : {})
			}
		}
	}

	// TCP / HTTP(S): inject inline TLS material when provided. Passing all three
	// (ca, cert, key) makes docker-modem switch to the https protocol.
	const { ca, cert, key } = loadInlineTlsMaterial()
	const options: DockerConnectionOptions = {}
	if (ca) options.ca = ca
	if (cert) options.cert = cert
	if (key) options.key = key

	return options
}

function createDocker(): Docker {
	const remoteOptions = buildRemoteOptions()

	if (remoteOptions) {
		// docker-modem resolves host/port/protocol/user from DOCKER_HOST.
		return new Docker(remoteOptions)
	}

	if (process.env.NODE_ENV === 'production') {
		return new Docker({ socketPath: '/var/run/docker.sock' })
	}

	const isWindows = process.platform === 'win32'
	const socketPath = isWindows
		? '//./pipe/docker_engine'
		: '/var/run/docker.sock'
	return new Docker({ socketPath })
}

if (process.env.NODE_ENV === 'production') {
	docker = createDocker()
} else {
	// Reuse a single instance across module reloads in development mode.
	if (!(global as any).docker) {
		;(global as any).docker = createDocker()
	}
	docker = (global as any).docker
}

export default docker
