import type { ContainerInfo } from 'dockerode'
import { describe, expect, it, vi } from 'vitest'
import type { NotificationMessage } from '@/types/app-state'

vi.mock('@/lib/app-state', () => ({
	loadState: vi.fn().mockResolvedValue({ notifiedUpdates: {} }),
	getPreferredLanguage: vi.fn().mockResolvedValue('en'),
	hasBeenNotified: vi.fn().mockReturnValue(false),
	markAsNotified: vi.fn().mockResolvedValue(undefined)
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
