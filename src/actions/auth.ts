'use server'

import { redirect } from 'next/navigation'
import { validateHtpasswd } from '@/lib/htpasswd'
import { getSession } from '@/lib/session'

export async function login(username: string, password: string) {
	const htpasswd = process.env.AUTH_HTPASSWD

	if (!htpasswd) {
		return { success: false, error: 'Autenticación no configurada' }
	}

	// Validar credenciales contra htpasswd
	const isValid = await validateHtpasswd(username, password, htpasswd)

	if (!isValid) {
		return { success: false, error: 'invalidCredentials' }
	}

	// Crear sesión con iron-session
	const session = await getSession()
	session.user = { username }
	session.isLoggedIn = true
	await session.save()

	return { success: true }
}

export async function logout() {
	const session = await getSession()
	session.destroy()
	redirect('/login')
}

export async function checkAuth() {
	const htpasswd = process.env.AUTH_HTPASSWD

	// Si no hay AUTH_HTPASSWD, no se requiere autenticación
	if (!htpasswd) {
		return { authenticated: true, required: false }
	}

	const session = await getSession()

	return {
		authenticated: session.isLoggedIn,
		required: true,
		username: session.user?.username
	}
}
