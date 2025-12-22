import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { defaultLocale, locales } from '@/lib/i18n'

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname

	// Check if there is any supported locale in the pathname
	const pathnameHasLocale = locales.some(
		(locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
	)

	if (pathnameHasLocale) {
		return NextResponse.next()
	}

	// Get locale from Accept-Language header or use default
	const acceptLanguage = request.headers.get('accept-language')
	let locale = defaultLocale

	if (acceptLanguage) {
		// Simple detection: check if Spanish is preferred
		if (acceptLanguage.toLowerCase().includes('es')) {
			locale = 'es'
		}
	}

	// Redirect to locale-prefixed path
	const newUrl = new URL(`/${locale}${pathname}`, request.url)
	return NextResponse.redirect(newUrl)
}

export const config = {
	matcher: [
		// Skip all internal paths (_next)
		'/((?!_next|api|favicon.ico|.*\\..*|android-chrome|apple-touch-icon|site.webmanifest).*)'
	]
}

