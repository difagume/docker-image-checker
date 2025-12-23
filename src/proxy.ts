import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
	const authEnabled = process.env.AUTH_HTPASSWD

	// Si la autenticación no está habilitada, permitir todo
	if (!authEnabled) {
		return NextResponse.next()
	}

	const session = request.cookies.get('auth-session')
	const { pathname } = request.nextUrl

	// Si no hay sesión y no está en /login, redirigir a login
	if (!session && pathname !== '/login') {
		return NextResponse.redirect(new URL('/login', request.url))
	}

	// Si hay sesión y está en /login, redirigir a home
	if (session && pathname === '/login') {
		return NextResponse.redirect(new URL('/', request.url))
	}

	return NextResponse.next()
}

export const config = {
	matcher: [
		'/((?!api|_next/static|_next/image|favicon.ico|site\\.webmanifest|.*\\.png|.*\\.svg).*)'
	]
}
