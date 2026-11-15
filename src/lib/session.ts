import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
	user?: {
		username: string
	}
	isLoggedIn: boolean
}

function getSessionPassword() {
	const password = process.env.AUTH_SESSION_PASSWORD

	if (password) {
		if (password.length < 32) {
			throw new Error('AUTH_SESSION_PASSWORD must be at least 32 characters')
		}
		return password
	}

	if (process.env.AUTH_HTPASSWD) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error(
				'AUTH_SESSION_PASSWORD (>= 32 chars) is required when AUTH_HTPASSWD is enabled'
			)
		}
		console.warn(
			'[auth] AUTH_SESSION_PASSWORD no está definido; usando AUTH_HTPASSWD como secreto de sesión solo en desarrollo. Define AUTH_SESSION_PASSWORD en producción.'
		)
		return process.env.AUTH_HTPASSWD
	}

	throw new Error(
		'AUTH_SESSION_PASSWORD (or AUTH_HTPASSWD) is required when authentication is enabled'
	)
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
