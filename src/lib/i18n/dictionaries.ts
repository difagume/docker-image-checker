import en from '@/lib/i18n/dictionaries/en.json'
import es from '@/lib/i18n/dictionaries/es.json'

export type Locale = 'en' | 'es'
export const defaultLocale: Locale = 'en'

export const dictionaries = {
	en,
	es
} as const

export type Dictionary = typeof dictionaries.en

export function getDictionary(locale: Locale): Dictionary {
	return dictionaries[locale] || dictionaries[defaultLocale]
}
