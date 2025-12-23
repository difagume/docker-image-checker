/* 'use server'

import { redirect } from 'next/navigation'
import { isAuthenticated, requiresAuth } from '@/lib/auth'

export async function checkAuth(): Promise<boolean> {
	// If no authentication is required, return true
	if (!requiresAuth()) {
		return true
	}

	// Check if user is authenticated based on session
	return await isAuthenticated()
}

export async function requireAuth(): Promise<void> {
	// If authentication is required and user is not authenticated, redirect to login
	if (requiresAuth() && !(await isAuthenticated())) {
		redirect('/login')
	}
}
 */

'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateHtpasswd } from '@/lib/htpasswd'

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

	// Crear sesión
	const cookieStore = await cookies()
	cookieStore.set('auth-session', username, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7, // 7 días
		path: '/'
	})

	return { success: true }
}

export async function logout() {
	const cookieStore = await cookies()
	cookieStore.delete('auth-session')
	redirect('/login')
}

export async function checkAuth() {
	const htpasswd = process.env.AUTH_HTPASSWD

	// Si no hay AUTH_HTPASSWD, no se requiere autenticación
	if (!htpasswd) {
		return { authenticated: true, required: false }
	}

	const cookieStore = await cookies()
	const session = cookieStore.get('auth-session')

	return {
		authenticated: !!session,
		required: true,
		username: session?.value
	}
}
