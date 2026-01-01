export type PolicyState =
	| 'NO_CHANGES'
	| 'CONTENT_UPDATED'
	| 'NEW_COMPATIBLE_VERSION_AVAILABLE'
	| 'NEW_MAJOR_VERSION_AVAILABLE'
	| 'UNKNOWN_TAG_STRATEGY'

export interface RemoteTag {
	tag: string
	digest: string
	publishedAt?: string
}

export interface ImageContext {
	imageName: string
	currentTag: string
	currentDigest: string
	remoteTags: RemoteTag[]
}

export interface PolicyResult {
	policy: string
	track: string
	state: PolicyState
	currentTag: string
	currentDigest: string
	details?: {
		latestCompatible?: string
		majorAvailable?: string
		comparedTag?: string
	}
}
