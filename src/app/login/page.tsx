import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import LoginForm from './login-form'

export default async function LoginPage() {
	// Si no hay AUTH_HTPASSWD configurado, redirigir a home
	if (!process.env.AUTH_HTPASSWD) {
		redirect('/')
	}

	// Si ya hay sesión, redirigir a home
	const cookieStore = await cookies()
	const session = cookieStore.get('auth-session')

	if (session) {
		redirect('/')
	}

	const locale = await getLocale()
	const dict = getDictionary(locale)

	return <LoginForm dict={dict.login} />
}
