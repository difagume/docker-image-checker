import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'

export function formatRelativeTime(
	date: Date,
	dict: Dictionary,
	locale: Locale
) {
	const now = new Date()

	let years = now.getFullYear() - date.getFullYear()
	let months = now.getMonth() - date.getMonth()
	let days = now.getDate() - date.getDate()

	if (days < 0) {
		months -= 1
		const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
		days += prevMonth
	}
	if (months < 0) {
		years -= 1
		months += 12
	}

	const parts: string[] = []
	if (years > 0)
		parts.push(`${years} ${years === 1 ? dict.time.year : dict.time.years}`)
	if (months > 0)
		parts.push(`${months} ${months === 1 ? dict.time.month : dict.time.months}`)
	if (days > 0)
		parts.push(`${days} ${days === 1 ? dict.time.day : dict.time.days}`)

	if (parts.length > 0) {
		if (parts.length > 1) {
			const lastPart = parts.pop()
			if (locale === 'es') {
				return `${dict.time.ago} ${parts.join(', ')} y ${lastPart}`
			}
			if (locale === 'pt') {
				return `${dict.time.ago} ${parts.join(', ')} e ${lastPart}`
			}
			return `${parts.join(', ')} and ${lastPart} ${dict.time.ago}`
		}
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${parts[0]}`
		}
		return `${parts[0]} ${dict.time.ago}`
	}

	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
	if (diffInSeconds < 60) return dict.time.momentAgo

	const minutes = Math.floor(diffInSeconds / 60)
	if (minutes < 60) {
		const label = `${minutes} ${minutes === 1 ? dict.time.minute : dict.time.minutes}`
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${label}`
		}
		return `${label} ${dict.time.ago}`
	}

	const hours = Math.floor(minutes / 60)
	const label = `${hours} ${hours === 1 ? dict.time.hour : dict.time.hours}`
	if (locale === 'es' || locale === 'pt') {
		return `${dict.time.ago} ${label}`
	}
	return `${label} ${dict.time.ago}`
}
