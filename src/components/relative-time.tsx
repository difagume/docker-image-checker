'use client'

import { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/format-relative-time'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'

interface RelativeTimeProps {
	date: string
	dict: Dictionary
	locale: Locale
}

/**
 * Renders a relative time ("2 hours ago") entirely on the client.
 *
 * The label is computed only after mount and refreshed every minute. This is
 * required because formatting depends on the local timezone and clock: during
 * SSR the server (container, usually UTC) and the browser (user's local time)
 * can compute different labels for the same timestamp, which breaks hydration.
 * A stable placeholder is rendered during SSR/hydration to keep both sides
 * identical.
 */
export function RelativeTime({ date, dict, locale }: RelativeTimeProps) {
	const [label, setLabel] = useState<string | null>(null)

	useEffect(() => {
		const update = () =>
			setLabel(formatRelativeTime(new Date(date), dict, locale))
		update()
		const id = window.setInterval(update, 60_000)
		return () => window.clearInterval(id)
	}, [date, dict, locale])

	return <span className='text-xs'>{label ?? '\u00a0'}</span>
}
