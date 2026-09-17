import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '@/lib/format-relative-time'
import { getDictionary } from '@/lib/i18n/dictionaries'

function hoursAgo(h: number): Date {
	return new Date(Date.now() - h * 3600_000)
}

describe('formatRelativeTime sub-48h precision (T7)', () => {
	it('17h => "hace 17 horas", no "hace 1 día" (es)', () => {
		const dict = getDictionary('es')
		expect(formatRelativeTime(hoursAgo(17), dict, 'es')).toBe('hace 17 horas')
	})

	it('47h => horas (floor) en es/en/pt', () => {
		expect(formatRelativeTime(hoursAgo(47), getDictionary('es'), 'es')).toBe(
			'hace 47 horas'
		)
		expect(formatRelativeTime(hoursAgo(47), getDictionary('en'), 'en')).toBe(
			'47 hours ago'
		)
		expect(formatRelativeTime(hoursAgo(47), getDictionary('pt'), 'pt')).toBe(
			'há 47 horas'
		)
	})

	it('49h => días (comportamiento calendario intacto)', () => {
		const dict = getDictionary('es')
		const out = formatRelativeTime(hoursAgo(49), dict, 'es')
		expect(out).toMatch(/hace \d+ días/)
		expect(out).not.toContain('horas')
	})

	it('distinto día-calendario pero <48h => horas (5h cruzando medianoche)', () => {
		const dict = getDictionary('es')
		const now = new Date()
		// 5h atrás garantizado <48h aunque cambie el día-calendario
		const d = new Date(now.getTime() - 5 * 3600_000)
		const out = formatRelativeTime(d, dict, 'es')
		expect(out).toBe('hace 5 horas')
	})

	it('1h singular se mantiene en los tres idiomas', () => {
		expect(formatRelativeTime(hoursAgo(1), getDictionary('es'), 'es')).toBe(
			'hace 1 hora'
		)
		expect(formatRelativeTime(hoursAgo(1), getDictionary('en'), 'en')).toBe(
			'1 hour ago'
		)
		expect(formatRelativeTime(hoursAgo(1), getDictionary('pt'), 'pt')).toBe(
			'há 1 hora'
		)
	})
})
