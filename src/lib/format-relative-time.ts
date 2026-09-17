import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'

export function formatRelativeTime(
	date: Date | Temporal.PlainDate,
	dict: Dictionary,
	locale: Locale
) {
	const nowInstant = Temporal.Now.instant()
	let dateInstant: Temporal.Instant
	if (date instanceof Temporal.PlainDate) {
		dateInstant = date.toZonedDateTime('UTC').toInstant()
	} else {
		dateInstant = Temporal.Instant.from(date.toISOString())
	}
	const diffInSeconds = Math.floor(
		(nowInstant.epochMilliseconds - dateInstant.epochMilliseconds) / 1000
	)

	if (diffInSeconds < 60) return dict.time.momentAgo

	const minutes = Math.floor(diffInSeconds / 60)
	if (minutes < 60) {
		const label = `${minutes} ${minutes === 1 ? dict.time.minute : dict.time.minutes}`
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${label}`
		}
		return `${label} ${dict.time.ago}`
	}

	// Sub-48h precision: floor hours instead of calendar-day rounding
	if (diffInSeconds < 48 * 3600) {
		const hours = Math.floor(minutes / 60)
		const label = `${hours} ${hours === 1 ? dict.time.hour : dict.time.hours}`
		if (locale === 'es' || locale === 'pt') {
			return `${dict.time.ago} ${label}`
		}
		return `${label} ${dict.time.ago}`
	}

	const plainDate =
		date instanceof Temporal.PlainDate
			? date
			: Temporal.PlainDate.from(date.toISOString().split('T')[0])
	const now = Temporal.Now.plainDateISO()
	const duration = now.since(plainDate, { largestUnit: 'year' })

	const years = duration.years
	const months = duration.months
	const days = duration.days

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

	// Fallback (unreachable for >=48h with distinct calendar dates)
	const hours = Math.floor(minutes / 60)
	const label = `${hours} ${hours === 1 ? dict.time.hour : dict.time.hours}`
	if (locale === 'es' || locale === 'pt') {
		return `${dict.time.ago} ${label}`
	}
	return `${label} ${dict.time.ago}`
}
