import net from 'node:net'
import type { ContainerInfo } from 'dockerode'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationMessage } from '@/types/app-state'

vi.mock('@/lib/app-state', () => ({
	loadState: vi.fn().mockResolvedValue({ notifiedUpdates: {} }),
	getPreferredLanguage: vi.fn().mockResolvedValue('en'),
	hasBeenNotified: vi.fn().mockReturnValue(false),
	markAsNotified: vi.fn().mockResolvedValue(undefined),
	alreadyNotifiedFresh: vi.fn().mockResolvedValue(false)
}))

vi.mock('@/lib/registry-updates', () => ({
	checkImageUpdateRaw: vi.fn()
}))

vi.mock('@/lib/reference-url-manager', () => ({
	getReferenceUrls: vi.fn().mockResolvedValue({})
}))

vi.mock('./provider-factory', () => ({
	getEnabledProviders: vi.fn()
}))

import {
	alreadyNotifiedFresh,
	loadState,
	markAsNotified
} from '@/lib/app-state'
import { checkImageUpdateRaw } from '@/lib/registry-updates'
import { checkAndNotify } from './notification-service'
import { getEnabledProviders } from './provider-factory'

function makeContainer(): ContainerInfo {
	return {
		Id: 'deadbeefcafe1234567890abcdef',
		Names: ['/web'],
		Image: 'nginx:1.0.0',
		ImageID: 'sha256:localimage'
	} as ContainerInfo
}

function makeCapturingProvider(): {
	provider: ReturnType<typeof getEnabledProviders>[number]
	sent: NotificationMessage[]
} {
	const sent: NotificationMessage[] = []
	const provider = {
		name: 'mock',
		enabled: true,
		validate: () => true,
		send: vi.fn(async (message: NotificationMessage) => {
			sent.push(message)
		})
	} as unknown as ReturnType<typeof getEnabledProviders>[number]
	return { provider, sent }
}

describe('checkAndNotify (R1)', () => {
	it('populates dockerContainerId and fullImageName from the real container (R1.1)', async () => {
		const { provider, sent } = makeCapturingProvider()
		vi.mocked(getEnabledProviders).mockReturnValue([provider])
		vi.mocked(checkImageUpdateRaw).mockResolvedValue({
			hasUpdate: true,
			latestDigest: 'sha256:newdigest',
			latestVersion: '1.2.3',
			currentVersion: '1.0.0'
		})

		await checkAndNotify([makeContainer()], [])

		expect(sent).toHaveLength(1)
		expect(sent[0].dockerContainerId).toBe('deadbeefcafe1234567890abcdef')
		expect(sent[0].fullImageName).toBe('nginx:1.2.3')
	})

	it('never emits a synthetic empty id (R1.2)', async () => {
		const { provider, sent } = makeCapturingProvider()
		vi.mocked(getEnabledProviders).mockReturnValue([provider])
		vi.mocked(checkImageUpdateRaw).mockResolvedValue({
			hasUpdate: true,
			latestDigest: 'sha256:newdigest',
			latestVersion: '2.0.0',
			currentVersion: '1.0.0'
		})

		await checkAndNotify([makeContainer()], [])

		expect(sent).toHaveLength(1)
		expect(sent[0].dockerContainerId).toBe('deadbeefcafe1234567890abcdef')
		expect(sent[0].dockerContainerId).not.toBe('')
	})

	it('carries the update i18n keys in the message translations (R14)', async () => {
		const { provider, sent } = makeCapturingProvider()
		vi.mocked(getEnabledProviders).mockReturnValue([provider])
		vi.mocked(checkImageUpdateRaw).mockResolvedValue({
			hasUpdate: true,
			latestDigest: 'sha256:newdigest',
			latestVersion: '1.2.3',
			currentVersion: '1.0.0'
		})

		await checkAndNotify([makeContainer()], [])

		const t = sent[0].translations
		expect(t).toBeDefined()
		for (const key of [
			'update',
			'updating',
			'updateStatusSuccess',
			'updateStatusError',
			'updateStatusAlready'
		] as const) {
			expect(t?.[key]).toBeTypeOf('string')
			expect(t?.[key]).not.toBe('')
		}
	})
})

describe('checkAndNotify overlap (B-07 / fix-notify-race)', () => {
	afterEach(() => {
		vi.mocked(loadState).mockResolvedValue({ notifiedUpdates: {} })
		vi.mocked(markAsNotified).mockResolvedValue(undefined)
		vi.mocked(alreadyNotifiedFresh).mockResolvedValue(false)
	})

	it('sends exactly once when two rounds overlap with a slow provider', async () => {
		const store: { notifiedUpdates: Record<string, unknown> } = {
			notifiedUpdates: {}
		}
		const key = (u: {
			containerName: string
			imageName: string
			latestDigest?: string
		}) => `${u.containerName}:${u.imageName}:${u.latestDigest}`

		vi.mocked(loadState).mockImplementation(async () =>
			JSON.parse(JSON.stringify(store))
		)
		vi.mocked(markAsNotified).mockImplementation(async (u) => {
			store.notifiedUpdates[key(u)] = { notifiedAt: new Date().toISOString() }
		})
		// Mirrors the real alreadyNotifiedFresh: re-reads current store state.
		vi.mocked(alreadyNotifiedFresh).mockImplementation(async (u) =>
			Boolean(store.notifiedUpdates[key(u)])
		)

		const { provider, sent } = makeCapturingProvider()
		provider.send = vi.fn(async (message: NotificationMessage) => {
			// Slow transport: round B overlaps while round A is in flight.
			await new Promise((r) => setTimeout(r, 40))
			sent.push(message)
		})
		vi.mocked(getEnabledProviders).mockReturnValue([provider])
		vi.mocked(checkImageUpdateRaw).mockResolvedValue({
			hasUpdate: true,
			latestDigest: 'sha256:d1',
			latestVersion: '1.2.3',
			currentVersion: '1.0.0'
		})

		await Promise.all([
			checkAndNotify([makeContainer()], []),
			(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return checkAndNotify([makeContainer()], [])
			})()
		])

		expect(sent).toHaveLength(1)
	})
})

describe('checkAndNotify per-send deadline (B-08 / fix-provider-robustness)', () => {
	beforeEach(() => {
		vi.mocked(markAsNotified).mockClear()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.mocked(markAsNotified).mockResolvedValue(undefined)
	})

	// Local server that accepts the TCP connection and NEVER responds —
	// the hung-endpoint repro from the spec.
	function makeHungServer(): Promise<{ url: string; close: () => void }> {
		return new Promise((resolve) => {
			const server = net.createServer((socket) => {
				// Deliberately never write an HTTP response.
				socket.on('error', () => {})
			})
			server.listen(0, '127.0.0.1', () => {
				const address = server.address()
				if (typeof address !== 'object' || !address) {
					throw new Error('no address')
				}
				resolve({
					url: `http://127.0.0.1:${address.port}`,
					close: () => server.close()
				})
			})
		})
	}

	it('fails the hung send within the deadline while remaining providers still dispatch', async () => {
		vi.stubEnv('NOTIFICATIONS_SEND_TIMEOUT_MS', '300')
		const hung = await makeHungServer()

		// A provider whose send performs a real fetch against the hung endpoint.
		const hungProvider = {
			name: 'hung',
			enabled: true,
			validate: () => true,
			send: vi.fn(async () => {
				await fetch(hung.url, { method: 'POST' })
			})
		} as unknown as ReturnType<typeof getEnabledProviders>[number]

		const { provider: goodProvider, sent } = makeCapturingProvider()
		vi.mocked(getEnabledProviders).mockReturnValue([hungProvider, goodProvider])
		vi.mocked(checkImageUpdateRaw).mockResolvedValue({
			hasUpdate: true,
			latestDigest: 'sha256:newdigest',
			latestVersion: '1.2.3',
			currentVersion: '1.0.0'
		})

		const startedAt = Date.now()
		await checkAndNotify([makeContainer()], [])
		const elapsed = Date.now() - startedAt

		hung.close()

		// The round completed — no hang past the deadline.
		expect(elapsed).toBeLessThan(10_000)
		// Remaining providers still dispatched.
		expect(sent).toHaveLength(1)
		expect(sent[0].containerName).toBe('web')
		// Deadline failure did not abort marking (ND-01 reserve-before-send):
		// the dedup entry stays marked (NOTIF-07).
		expect(vi.mocked(markAsNotified)).toHaveBeenCalledTimes(1)
	})
})
