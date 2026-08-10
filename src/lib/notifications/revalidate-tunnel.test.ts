import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	getInternalRevalidateUrl,
	getRevalidateNonce,
	requestRevalidation
} from './revalidate-tunnel'

describe('revalidate-tunnel (R12)', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('derives the loopback URL from PORT (default 3000)', () => {
		vi.stubEnv('INTERNAL_REVALIDATE_URL', '')
		vi.stubEnv('PORT', '')
		expect(getInternalRevalidateUrl()).toBe(
			'http://127.0.0.1:3000/api/internal/revalidate'
		)
	})

	it('uses PORT when set', () => {
		vi.stubEnv('INTERNAL_REVALIDATE_URL', '')
		vi.stubEnv('PORT', '8080')
		expect(getInternalRevalidateUrl()).toBe(
			'http://127.0.0.1:8080/api/internal/revalidate'
		)
	})

	it('prefers the INTERNAL_REVALIDATE_URL override and trims trailing slashes', () => {
		vi.stubEnv('INTERNAL_REVALIDATE_URL', 'http://127.0.0.1:9090/x/')
		expect(getInternalRevalidateUrl()).toBe('http://127.0.0.1:9090/x')
	})

	it('returns a stable in-process nonce', () => {
		const a = getRevalidateNonce()
		const b = getRevalidateNonce()
		expect(a).toBe(b)
		expect(a).toMatch(/^[0-9a-f-]{36}$/)
	})

	it('returns true when the route revalidates successfully (R12.1)', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		const ok = await requestRevalidation(['docker:containers'])

		expect(ok).toBe(true)
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
		expect(url).toBe(getInternalRevalidateUrl())
		expect(init.headers).toEqual(
			expect.objectContaining({
				'x-revalidate-nonce': getRevalidateNonce()
			})
		)
		expect(JSON.parse(init.body as string)).toEqual({
			tags: ['docker:containers']
		})
	})

	it('returns false and swallows errors instead of throwing (R12.2)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

		await expect(requestRevalidation(['docker:containers'])).resolves.toBe(
			false
		)
	})

	it('returns false on a non-ok route response (R12.2)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
		)

		await expect(requestRevalidation(['docker:containers'])).resolves.toBe(
			false
		)
	})
})
