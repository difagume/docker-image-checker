import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

async function checkAuth() {
	const htpasswd = process.env.AUTH_HTPASSWD
	if (!htpasswd) return { authenticated: true, required: false }

	const session = await getSession()
	return {
		authenticated: session.isLoggedIn,
		required: true
	}
}

export async function proxy(request: NextRequest) {
	const { authenticated, required } = await checkAuth()
	const pathname = request.nextUrl.pathname

	if (!required) return NextResponse.next()

	if (!authenticated && pathname !== '/login') {
		return NextResponse.redirect(new URL('/login', request.url))
	}

	if (authenticated && pathname === '/login') {
		return NextResponse.redirect(new URL('/', request.url))
	}

	const isDev = process.env.NODE_ENV !== 'production'
	const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
	const cspHeader = `
	    default-src 'self';
	    script-src ${isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : `'self' 'nonce-${nonce}' 'strict-dynamic'`};
	    style-src 'self' 'unsafe-inline';
		connect-src 'self' ${isDev ? 'ws: wss:' : ''};
	    img-src 'self' blob: data:;
	    font-src 'self';
	    object-src 'none';
	    base-uri 'self';
	    form-action 'self';
	    frame-ancestors 'none';
	    upgrade-insecure-requests;
	  `
	const contentSecurityPolicyHeaderValue = cspHeader
		.replace(/\s{2,}/g, ' ')
		.trim()

	const requestHeaders = new Headers(request.headers)
	requestHeaders.set('x-nonce', nonce)
	requestHeaders.set(
		'Content-Security-Policy',
		contentSecurityPolicyHeaderValue
	)

	const response = NextResponse.next({
		request: {
			headers: requestHeaders
		}
	})
	response.headers.set(
		'Content-Security-Policy',
		contentSecurityPolicyHeaderValue
	)

	return response
}

export const config = {
	matcher: [
		{
			source:
				'/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)',
			missing: [
				{ type: 'header', key: 'next-router-prefetch' },
				{ type: 'header', key: 'purpose', value: 'prefetch' }
			]
		}
	]
}
