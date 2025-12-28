import { headers } from 'next/headers'
import type { Locale } from './dictionaries'
import { defaultLocale } from './dictionaries'

export async function getLocale(): Promise<Locale> {
	const headersList = await headers()
	const acceptLanguage = headersList.get('accept-language')

	// Si existe Accept-Language, intentar extraer el idioma preferido
	if (acceptLanguage) {
		const languages = acceptLanguage.split(',').map((lang) => {
			const parts = lang.trim().split(';')
			return parts[0].split('-')[0].toLowerCase()
		})

		// Si detecta español, usar español
		if (languages.includes('es')) {
			return 'es'
		}

		// Si detecta portugués, usar portugués
		if (languages.includes('pt')) {
			return 'pt'
		}
	}

	// Por defecto, inglés
	return defaultLocale
}
