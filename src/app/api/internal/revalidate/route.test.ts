import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_TAGS } from '@/lib/cache-tags'
import { getRevalidateNonce } from '@/lib/notifications/revalidate-tunnel'

vi.mock('next/cache', () => ({
	revalidateTag: vi.fn()
}))

import { revalidateTag } from 'next/cache'
import { POST } from './route'

function makeRequest(
	body: unknown,
	headers: Record<string, string> = {}
): NextRequest {
	return {
		headers: new Headers(headers),
		json: async () => body
	} as unknown as NextRequest
}

describe('POST /api/internal/revalidate (R12.1, R12.3)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('revalidates REFRESH_TAGS with { expire: 0 } when nonce is valid (R12.1)', async () => {
		const response = await POST(
			makeRequest(
				{ tags: [...REFRESH_TAGS] },
				{ 'x-revalidate-nonce': getRevalidateNonce() }
			)
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as { revalidated: boolean }
		expect(body.revalidated).toBe(true)
		for (const tag of REFRESH_TAGS) {
			expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
		}
	})

	it('rejects requests without the nonce header (403) (R12.3)', async () => {
		const response = await POST(makeRequest({ tags: REFRESH_TAGS }))

		expect(response.status).toBe(403)
		expect(revalidateTag).not.toHaveBeenCalled()
	})

	it('rejects requests with a wrong nonce (403) (R12.3)', async () => {
		const response = await POST(
			makeRequest(
				{ tags: REFRESH_TAGS },
				{ 'x-revalidate-nonce': 'not-the-nonce' }
			)
		)

		expect(response.status).toBe(403)
		expect(revalidateTag).not.toHaveBeenCalled()
	})

	it('rejects requests that advertise a non-loopback client (403) (R12.3)', async () => {
		const response = await POST(
			makeRequest(
				{ tags: REFRESH_TAGS },
				{
					'x-revalidate-nonce': getRevalidateNonce(),
					'x-forwarded-for': '8.8.8.8'
				}
			)
		)

		expect(response.status).toBe(403)
		expect(revalidateTag).not.toHaveBeenCalled()
	})

	it('rejects an unparseable body (400)', async () => {
		const response = await POST({
			headers: new Headers({ 'x-revalidate-nonce': getRevalidateNonce() }),
			json: async () => {
				throw new SyntaxError('Unexpected token')
			}
		} as unknown as NextRequest)

		expect(response.status).toBe(400)
		expect(revalidateTag).not.toHaveBeenCalled()
	})

	it('rejects a body without a tags array (400)', async () => {
		const response = await POST(
			makeRequest(
				{ tags: 'docker:containers' },
				{ 'x-revalidate-nonce': getRevalidateNonce() }
			)
		)

		expect(response.status).toBe(400)
		expect(revalidateTag).not.toHaveBeenCalled()
	})

	it('filters unknown tags and only revalidates allowed REFRESH_TAGS', async () => {
		const response = await POST(
			makeRequest(
				{ tags: [...REFRESH_TAGS, 'docker:unknown'] },
				{ 'x-revalidate-nonce': getRevalidateNonce() }
			)
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as { tags: string[] }
		expect(body.tags).toEqual([...REFRESH_TAGS])
		expect(revalidateTag).not.toHaveBeenCalledWith('docker:unknown', {
			expire: 0
		})
	})
})
