// Centralized parsing for Docker image references (`name[:tag][@digest]`).
// A naive `image.split(':')` breaks for registries with a port
// (`registry.local:5000/img` → name "registry.local", tag "5000/img").

export interface ImageReference {
	/** Image name without tag or digest (may include registry host/port). */
	repository: string
	/** Tag friendly (e.g. `v0.30.3`, `16`, `latest`). Never a digest. */
	tag: string
	/** Digest without `@` (e.g. `sha256:abc`) when the reference pins one. */
	digest?: string
	/** True when the reference pins a digest (`@sha256:...`). */
	isDigest: boolean
}

export function parseImageReference(image: string): ImageReference {
	const digestIndex = image.indexOf('@')
	let digest: string | undefined
	let withoutDigest = image
	if (digestIndex > -1) {
		digest = image.slice(digestIndex + 1)
		withoutDigest = image.slice(0, digestIndex)
	}

	// The last `:` only separates a tag when what follows contains no `/`
	// (otherwise it is a registry port, e.g. `registry.local:5000/img`).
	const lastColon = withoutDigest.lastIndexOf(':')
	if (lastColon > -1 && !withoutDigest.slice(lastColon + 1).includes('/')) {
		return {
			repository: withoutDigest.slice(0, lastColon),
			tag: withoutDigest.slice(lastColon + 1),
			digest,
			isDigest: !!digest
		}
	}

	return { repository: withoutDigest, tag: 'latest', digest, isDigest: !!digest }
}

/** Replace the tag of an image reference, keeping registry host and port. */
export function withTag(image: string, tag: string): string {
	return `${parseImageReference(image).repository}:${tag}`
}

export function resolveLocalDigest(
	img: { RepoDigests?: string[] | null } | undefined
): string | undefined {
	return img?.RepoDigests?.[0]?.split('@')[1]
}
