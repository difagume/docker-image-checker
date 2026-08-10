import { revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import { getRevalidateNonce } from '@/lib/notifications/revalidate-tunnel'

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function isLoopbackAddress(ip: string | undefined): boolean {
	if (!ip) return false
	return LOOPBACK_IPS.has(ip)
}

/**
 * Best-effort loopback guard. Only meaningful when a proxy header reveals the
 * client address; direct connections to 127.0.0.1 carry no such header. The
 * in-process nonce is the primary gate (R12.3, N3).
 */
function looksLoopback(request: NextRequest): boolean {
	const forwarded = request.headers.get('x-forwarded-for')
	if (forwarded) {
		const first = forwarded.split(',')[0]?.trim()
		if (first && !isLoopbackAddress(first)) return false
	}
	const realIp = request.headers.get('x-real-ip')
	if (realIp && !isLoopbackAddress(realIp.trim())) return false
	return true
}

/**
 * Internal cache revalidation tunnel. Loopback-only, guarded by the in-process
 * nonce shared with the polling path (`getRevalidateNonce`). Calls
 * `revalidateTag(tag, { expire: 0 })` for each allowed `REFRESH_TAGS` entry so
 * the dashboard reflects Telegram-driven updates promptly without exposing the
 * route to external callers.
 */
export async function POST(request: NextRequest) {
	const nonce = request.headers.get('x-revalidate-nonce')
	if (!nonce || nonce !== getRevalidateNonce()) {
		return Response.json(
			{ revalidated: false, error: 'Forbidden' },
			{ status: 403 }
		)
	}

	if (!looksLoopback(request)) {
		return Response.json(
			{ revalidated: false, error: 'Forbidden' },
			{ status: 403 }
		)
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return Response.json(
			{ revalidated: false, error: 'Invalid body' },
			{ status: 400 }
		)
	}

	const tags: unknown = (body as { tags?: unknown } | null)?.tags
	if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
		return Response.json(
			{ revalidated: false, error: 'Invalid tags' },
			{ status: 400 }
		)
	}

	const allowed = new Set(REFRESH_TAGS)
	const revalidatedTags = (tags as string[]).filter((tag) => allowed.has(tag))
	for (const tag of revalidatedTags) {
		revalidateTag(tag, { expire: 0 })
	}

	return Response.json({ revalidated: true, tags: revalidatedTags })
}
