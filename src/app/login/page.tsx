import { redirect } from 'next/navigation'
import { checkAuth } from '@/actions/auth'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import LoginForm from './login-form'

// instant = false: the login page is auth-gated; it reads session cookies via
// checkAuth() and request headers via getLocale() at the top to redirect
// authenticated users away. The gate must not be deferred behind the streamed
// shell. Deliberate Block under Cache Components.
export const instant = false

export default async function LoginPage() {
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
