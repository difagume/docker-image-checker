interface HeaderReader {
	get(name: string): string | null
}

/**
 * Best-effort client address for rate limiting. These headers are only
 * trustworthy behind a proxy that overwrites them; a direct client can spoof
 * them, so the limiter raises the bar but is not an authorization control.
 */
export function clientIpFromHeaders(headers: HeaderReader): string {
	const forwarded = headers.get('x-forwarded-for')
	const first = forwarded?.split(',')[0]?.trim()
	if (first) return first
	const realIp = headers.get('x-real-ip')?.trim()
	return realIp || 'unknown'
}
