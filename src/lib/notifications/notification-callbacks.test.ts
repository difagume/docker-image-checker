import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CallbackData } from './notification-callbacks'
import {
	clearContainerCallbacks,
	getCallbackData,
	getPendingCallbacksCount,
	removeCallbackData,
	storeCallbackData
} from './notification-callbacks'

async function makeTempFile(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'callbacks-'))
	return path.join(dir, 'telegram-callbacks.json')
}

describe('notification-callbacks', () => {
	let file: string

	beforeEach(async () => {
		file = await makeTempFile()
		vi.stubEnv('TELEGRAM_CALLBACKS_FILE', file)
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('persists a shortId mapping resolvable to the callback data (R3.1)', async () => {
		const shortId = await storeCallbackData('cont-1', 'nginx:1.2.3', 'es')

		expect(shortId).toMatch(/^u?[a-f0-9]{8}$/)
		expect(await getCallbackData(shortId)).toEqual({
			containerId: 'cont-1',
			fullImageName: 'nginx:1.2.3',
			locale: 'es',
			createdAt: expect.any(Number)
		})

		const raw = await fs.readFile(file, 'utf-8')
		expect(JSON.parse(raw)).toEqual(expect.objectContaining({ version: 1 }))
	})

	it('treats entries older than 24h as expired and purges them (R3.2)', async () => {
		vi.useFakeTimers()
		try {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
			const shortId = await storeCallbackData('cont-1', 'nginx:1.2.3', 'en')
			expect(await getCallbackData(shortId)).not.toBeNull()

			vi.setSystemTime(new Date('2026-01-02T00:00:01Z'))
			expect(await getCallbackData(shortId)).toBeNull()
			expect(await getPendingCallbacksCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('caps the store at 1000 entries evicting the oldest (R3.3)', async () => {
		const base = Date.now() - 1000
		const seed: Record<string, CallbackData> = {}
		for (let i = 0; i < 1000; i++) {
			const id = i.toString(16).padStart(8, '0')
			seed[id] = {
				containerId: `cont-${i}`,
				fullImageName: `img:${i}`,
				locale: 'en',
				createdAt: base + i
			}
		}
		await fs.writeFile(
			file,
			JSON.stringify({ version: 1, callbacks: seed }),
			'utf-8'
		)

		const newId = await storeCallbackData('cont-overflow', 'img:overflow', 'en')

		expect(await getPendingCallbacksCount()).toBe(1000)
		expect(await getCallbackData('00000000')).toBeNull()
		expect(await getCallbackData('000003e7')).not.toBeNull()
		expect(await getCallbackData(newId)).not.toBeNull()
	})

	it('removes a single callback by shortId', async () => {
		const first = await storeCallbackData('c1', 'img:1', 'en')
		const second = await storeCallbackData('c2', 'img:2', 'en')

		await removeCallbackData(first)

		expect(await getCallbackData(first)).toBeNull()
		expect(await getCallbackData(second)).not.toBeNull()
	})

	it('clears every callback for a container and returns the count (R11)', async () => {
		const first = await storeCallbackData('cont-a', 'img:1', 'en')
		await storeCallbackData('cont-a', 'img:2', 'es')
		const other = await storeCallbackData('cont-b', 'img:3', 'en')

		const removed = await clearContainerCallbacks('cont-a')

		expect(removed).toBe(2)
		expect(await getCallbackData(first)).toBeNull()
		expect(await getCallbackData(other)).not.toBeNull()
	})

	it('does not lose entries or corrupt the file under concurrent stores (N4)', async () => {
		const ids = await Promise.all(
			Array.from({ length: 25 }, (_, i) =>
				storeCallbackData(`cont-${i}`, `img:${i}`, 'en')
			)
		)

		expect(await getPendingCallbacksCount()).toBe(25)
		const raw = await fs.readFile(file, 'utf-8')
		expect(JSON.parse(raw)).toEqual(
			expect.objectContaining({
				version: 1,
				callbacks: expect.any(Object)
			})
		)
		for (const id of ids) {
			expect(await getCallbackData(id)).not.toBeNull()
		}
	})
})
