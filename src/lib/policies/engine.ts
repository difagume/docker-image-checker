import type { ImageContext, PolicyResult, RemoteTag } from './types'

// Semver helper
const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(-(.*))?$/

function parseSemver(name: string) {
	const match = name.match(SEMVER_REGEX)
	if (!match) return null
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		suffix: match[5] || '',
		full: name
	}
}

// 5.1 LatestPolicy
function evaluateLatestPolicy(context: ImageContext): PolicyResult | null {
	if (context.currentTag !== 'latest') return null

	const latestRemote = context.remoteTags.find((t) => t.tag === 'latest')
	if (!latestRemote) return null // Should not happen if context is valid

	return {
		policy: 'LatestPolicy',
		track: 'latest',
		state:
			context.currentDigest !== latestRemote.digest
				? 'CONTENT_UPDATED'
				: 'NO_CHANGES',
		currentTag: context.currentTag,
		currentDigest: context.currentDigest
	}
}

// 5.2 SemverPolicy
function evaluateSemverPolicy(context: ImageContext): PolicyResult | null {
	const currentVer = parseSemver(context.currentTag)
	if (!currentVer) return null

	const semverTags = context.remoteTags
		.map((t) => {
			const ver = parseSemver(t.tag)
			return ver ? { ...t, ver } : null
		})
		.filter(
			(
				t
			): t is RemoteTag & {
				ver: NonNullable<ReturnType<typeof parseSemver>>
			} => t !== null
		)

	const sameMajor = semverTags
		.filter((t) => t.ver.major === currentVer.major)
		.sort((a, b) => {
			if (b.ver.minor !== a.ver.minor) return b.ver.minor - a.ver.minor
			return b.ver.patch - a.ver.patch
		})

	const higherMajor = semverTags
		.filter((t) => t.ver.major > currentVer.major)
		.sort((a, b) => a.ver.major - b.ver.major) // Get lowest higher major

	const latestCompatible = sameMajor[0]

	if (
		latestCompatible &&
		(latestCompatible.ver.minor > currentVer.minor ||
			(latestCompatible.ver.minor === currentVer.minor &&
				latestCompatible.ver.patch > currentVer.patch))
	) {
		return {
			policy: 'SemverPolicy',
			track: `semver:${currentVer.major}`,
			state: 'NEW_COMPATIBLE_VERSION_AVAILABLE',
			currentTag: context.currentTag,
			currentDigest: context.currentDigest,
			details: {
				latestCompatible: latestCompatible.tag
			}
		}
	}

	if (higherMajor.length > 0) {
		return {
			policy: 'SemverPolicy',
			track: `semver:${currentVer.major}`,
			state: 'NEW_MAJOR_VERSION_AVAILABLE',
			currentTag: context.currentTag,
			currentDigest: context.currentDigest,
			details: {
				majorAvailable: higherMajor[0].tag
			}
		}
	}

	return {
		policy: 'SemverPolicy',
		track: `semver:${currentVer.major}`,
		state: 'NO_CHANGES',
		currentTag: context.currentTag,
		currentDigest: context.currentDigest
	}
}

// 5.3 DevTagPolicy
function evaluateDevTagPolicy(context: ImageContext): PolicyResult | null {
	const prefixes = ['master', 'main', 'edge', 'nightly', 'dev']
	const prefix = prefixes.find((p) => context.currentTag.startsWith(p))
	if (!prefix) return null

	const remoteTag = context.remoteTags.find((t) => t.tag === context.currentTag)
	if (!remoteTag) return null

	return {
		policy: 'DevTagPolicy',
		track: 'dev',
		state:
			context.currentDigest !== remoteTag.digest
				? 'CONTENT_UPDATED'
				: 'NO_CHANGES',
		currentTag: context.currentTag,
		currentDigest: context.currentDigest
	}
}

// 5.4 CustomTagPolicy (Fallback)
function evaluateCustomTagPolicy(context: ImageContext): PolicyResult {
	const remoteTag = context.remoteTags.find((t) => t.tag === context.currentTag)

	if (!remoteTag) {
		return {
			policy: 'CustomTagPolicy',
			track: 'custom',
			state: 'UNKNOWN_TAG_STRATEGY',
			currentTag: context.currentTag,
			currentDigest: context.currentDigest
		}
	}

	return {
		policy: 'CustomTagPolicy',
		track: 'custom',
		state:
			context.currentDigest !== remoteTag.digest
				? 'CONTENT_UPDATED'
				: 'NO_CHANGES',
		currentTag: context.currentTag,
		currentDigest: context.currentDigest
	}
}

export function evaluatePolicies(context: ImageContext): PolicyResult {
	return (
		evaluateLatestPolicy(context) ||
		evaluateSemverPolicy(context) ||
		evaluateDevTagPolicy(context) ||
		evaluateCustomTagPolicy(context)
	)
}
