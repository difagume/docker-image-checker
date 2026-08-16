import { getSession } from '@/lib/session'

/**
 * Guard for Server Actions and API routes. When AUTH_HTPASSWD is set the
 * caller must have an authenticated session; otherwise auth is disabled and
 * everything passes through.
 */
export async function requireAuthIfEnabled(): Promise<void> {
	if (!process.env.AUTH_HTPASSWD) return
	const session = await getSession()
	if (!session.isLoggedIn) {
		throw new Error('Unauthorized')
	}
}

/**
 * API-route variant of requireAuthIfEnabled: returns a 401 response when the
 * caller is unauthenticated, or null when the request may proceed.
 */
export async function unauthorizedResponseIfEnabled(): Promise<Response | null> {
	if (!process.env.AUTH_HTPASSWD) return null
	const session = await getSession()
	if (session.isLoggedIn) return null
	return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
