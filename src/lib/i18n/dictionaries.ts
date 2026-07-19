import { cache } from 'react'
import en from '@/lib/i18n/dictionaries/en.json'
import es from '@/lib/i18n/dictionaries/es.json'
import pt from '@/lib/i18n/dictionaries/pt-BR.json'

export type Locale = 'en' | 'es' | 'pt'
export const defaultLocale: Locale = 'en'

export const dictionaries = {
	en,
	es,
	pt
} as const

export type Dictionary = typeof dictionaries.en

export const getDictionary = cache((locale: Locale): Dictionary => {
	return dictionaries[locale] || dictionaries[defaultLocale]
})
