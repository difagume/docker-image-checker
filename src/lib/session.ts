import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
	user?: {
		username: string
	}
	isLoggedIn: boolean
}

function getSessionPassword() {
	const password =
		process.env.AUTH_SESSION_PASSWORD || process.env.AUTH_HTPASSWD

	if (!password) {
		throw new Error(
			'AUTH_SESSION_PASSWORD (or AUTH_HTPASSWD) is required when authentication is enabled'
		)
	}

	return password
}

function getSessionOptions(): SessionOptions {
	return {
		password: getSessionPassword(),
		cookieName: 'dic-session',
		cookieOptions: {
			secure: process.env.NODE_ENV === 'production'
		}
	}
}

declare module 'iron-session' {
	interface IronSessionData extends SessionData {}
}

export async function getSession() {
	const cookieStore = await cookies()
	const session = await getIronSession<SessionData>(
		cookieStore,
		getSessionOptions()
	)
	return session
}
