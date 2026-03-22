import type { ImageContext, PolicyResult, RemoteTag } from './types'

// Semver helper
const SEMVER_REGEX = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?([-+].*)?$/

function parseSemver(name: string) {
	const match = name.match(SEMVER_REGEX)
	if (!match) return null
	return {
		major: parseInt(match[1], 10),
		minor: match[2] ? parseInt(match[2], 10) : 0,
		patch: match[3] ? parseInt(match[3], 10) : 0,
		suffix: match[4] || '',
		full: name,
		parts: (match[1] ? 1 : 0) + (match[2] ? 1 : 0) + (match[3] ? 1 : 0)
	}
}

/**
 * When several tags share the same semver core (e.g. 8.6.1 vs 8.6.1-trixie),
 * pick the tag that best matches how the image was pinned:
 * - Plain semver → prefer no extra suffix (-baseline, -trixie, …).
 * - Variant pin (e.g. -alpine) → prefer exact -alpine over -alpine3.23.
 * Lower score = better match for display as "latest compatible".
 */
function suffixPreferenceScore(
	currentSuffix: string,
	candidateSuffix: string
): number {
	if (currentSuffix === '') {
		return candidateSuffix === '' ? 0 : 10 + candidateSuffix.length
	}
	const S = currentSuffix
	const C = candidateSuffix
	if (C === S) return 0
	if (C.startsWith(S) && C.length > S.length) return 10 + C.length
	if (C === '') return 100
	return 200 + C.length
}

function compareSemverRemoteTags(
	a: RemoteTag & { ver: NonNullable<ReturnType<typeof parseSemver>> },
	b: RemoteTag & { ver: NonNullable<ReturnType<typeof parseSemver>> },
	currentSuffix: string
): number {
	if (b.ver.minor !== a.ver.minor) return b.ver.minor - a.ver.minor
	if (b.ver.patch !== a.ver.patch) return b.ver.patch - a.ver.patch
	const diff =
		suffixPreferenceScore(currentSuffix, a.ver.suffix) -
		suffixPreferenceScore(currentSuffix, b.ver.suffix)
	if (diff !== 0) return diff
	return a.tag.localeCompare(b.tag)
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
		.sort((a, b) => compareSemverRemoteTags(a, b, currentVer.suffix))

	const higherMajor = semverTags
		.filter((t) => {
			if (t.ver.major <= currentVer.major) return false

			// Heuristic to avoid date-based tags if current is clearly semver
			// If current has 3 parts (x.y.z) and is small, avoid massive major jumps (years) with only 1 part
			if (
				currentVer.parts >= 2 &&
				currentVer.major < 1000 &&
				t.ver.major > 2000 &&
				t.ver.parts === 1
			) {
				return false
			}

			return true
		})
		.sort((a, b) => {
			if (a.ver.major !== b.ver.major) return a.ver.major - b.ver.major
			return compareSemverRemoteTags(a, b, currentVer.suffix)
		})

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
