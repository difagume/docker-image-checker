import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
	user?: {
		username: string
	}
	isLoggedIn: boolean
}

export const sessionOptions: SessionOptions = {
	password:
		process.env.AUTH_SESSION_PASSWORD ||
		'default_password_change_me_in_production',
	cookieName: 'dic-session',
	cookieOptions: {
		//httpOnly: true,
		secure: process.env.NODE_ENV === 'production'
		//sameSite: 'lax' as const,
		//maxAge: 60 * 60 * 24 * 7, // 7 días
		//path: '/'
	}
}

declare module 'iron-session' {
	interface IronSessionData extends SessionData {}
}

export async function getSession() {
	const cookieStore = await cookies()
	console.log('--->', process.env.NODE_ENV)

	const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
	return session
}
