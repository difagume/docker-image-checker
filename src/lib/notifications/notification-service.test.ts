import type { ContainerInfo } from 'dockerode'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
