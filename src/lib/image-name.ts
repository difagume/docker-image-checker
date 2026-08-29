// Centralized parsing for Docker image references (`name[:tag][@digest]`).
// A naive `image.split(':')` breaks for registries with a port
// (`registry.local:5000/img` → name "registry.local", tag "5000/img").

export interface ImageReference {
	/** Image name without tag or digest (may include registry host/port). */
	repository: string
	/** Tag, or the digest when the reference uses `@sha256:...`. */
	tag: string
	/** True when the reference pins a digest instead of a tag. */
	isDigest: boolean
}

export function parseImageReference(image: string): ImageReference {
	const digestIndex = image.indexOf('@')
	if (digestIndex > -1) {
		return {
			repository: image.slice(0, digestIndex),
			tag: image.slice(digestIndex + 1),
			isDigest: true
		}
	}

	// The last `:` only separates a tag when what follows contains no `/`
	// (otherwise it is a registry port, e.g. `registry.local:5000/img`).
	const lastColon = image.lastIndexOf(':')
	if (lastColon > -1 && !image.slice(lastColon + 1).includes('/')) {
		return {
			repository: image.slice(0, lastColon),
			tag: image.slice(lastColon + 1),
			isDigest: false
		}
	}

	return { repository: image, tag: 'latest', isDigest: false }
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
