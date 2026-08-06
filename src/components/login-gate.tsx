import { redirect } from 'next/navigation'
import { checkAuth } from '@/actions/auth'
import LoginForm from '@/app/login/login-form'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

/**
 * Auth + locale gate for `/login`. Runs inside the static shell's Suspense.
 * Redirects to `/` when auth is not configured or the user is already
 * authenticated (defense-in-depth; the proxy is the primary barrier).
 */
export async function LoginGate() {
	// Si no hay AUTH_HTPASSWD configurado, redirigir a home
	if (!process.env.AUTH_HTPASSWD) {
		redirect('/')
	}

	// Si ya hay sesión, redirigir a home
	const auth = await checkAuth()

	if (auth.authenticated) {
		redirect('/')
	}

	const locale = await getLocale()
	const dict = getDictionary(locale)

	return <LoginForm dict={dict.login} />
}
