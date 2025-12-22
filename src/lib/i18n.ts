import en from '@/dictionaries/en.json'
import es from '@/dictionaries/es.json'

export type Locale = 'en' | 'es'

export const locales: Locale[] = ['en', 'es']
export const defaultLocale: Locale = 'en'

export const dictionaries = {
	en,
	es
} as const

export type Dictionary = typeof en

export function getDictionary(locale: Locale): Dictionary {
	return dictionaries[locale] || dictionaries[defaultLocale]
}

