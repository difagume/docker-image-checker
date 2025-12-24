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
		'412DpguWscJjdZ0tEyRddn2vhM2svZnribzYJF0ydPQ=',
	cookieName: 'dic-session',
	cookieOptions: {
		secure: process.env.NODE_ENV === 'production'
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
