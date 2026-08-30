import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationMessage } from '@/types/app-state'
import { DiscordNotificationProvider } from './discord'
import { NtfyNotificationProvider } from './ntfy'

function makeMessage(): NotificationMessage {
	return {
		containerName: 'web',
		imageName: 'nginx',
		dockerContainerId: 'abc123',
		fullImageName: 'nginx:1.2.3',
		currentVersion: '1.0.0',
		latestVersion: '1.2.3',
		translations: {
			title: 'Docker Image Update Available',
			container: 'Container',
			image: 'Image',
			current: 'Current',
			latest: 'Latest',
			updated: 'Updated',
			viewReference: 'View reference',
			viewOnRegistry: 'View on registry',
			update: 'Update',
			updating: 'Updating',
			updateStatusSuccess: 'Success',
			updateStatusError: 'Error',
			updateStatusAlready: 'Already'
		},
		locale: 'en'
	}
}

describe('DiscordNotificationProvider.validate (B-15a parity)', () => {
	it('returns false when disabled, even if configuration is present', () => {
		const provider = new DiscordNotificationProvider()
		provider.enabled = false
		// Access private field for test setup only.
		;(provider as unknown as { webhookUrl: string }).webhookUrl =
			'https://discord.com/api/webhooks/x'
		expect(provider.validate()).toBe(false)
	})

	it('returns true when enabled with a webhook configured', () => {
		const provider = new DiscordNotificationProvider()
		provider.enabled = true
		;(provider as unknown as { webhookUrl: string }).webhookUrl =
			'https://discord.com/api/webhooks/x'
		expect(provider.validate()).toBe(true)
	})

	it('returns false when enabled but the webhook is missing', () => {
		const provider = new DiscordNotificationProvider()
		provider.enabled = true
		;(provider as unknown as { webhookUrl: string | undefined }).webhookUrl =
			undefined
		expect(provider.validate()).toBe(false)
	})
})

describe('send fetch deadline signal (defense-in-depth)', () => {
	const fetchMock = vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			new Response('ok', { status: 200, statusText: 'OK' })
	)

	beforeEach(() => {
		fetchMock.mockClear()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('ntfy send passes an AbortSignal to its fetch call', async () => {
		vi.stubGlobal('fetch', fetchMock)
		const provider = new NtfyNotificationProvider()
		provider.enabled = true
		;(provider as unknown as { topic: string }).topic = 'test-topic'
		;(provider as unknown as { server: string }).server = 'https://ntfy.test'

		await provider.send(makeMessage())

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const options = fetchMock.mock.calls[0][1] as RequestInit
		expect(options.signal).toBeInstanceOf(AbortSignal)
	})

	it('discord send passes an AbortSignal to its fetch call', async () => {
		vi.stubGlobal('fetch', fetchMock)
		const provider = new DiscordNotificationProvider()
		provider.enabled = true
		;(provider as unknown as { webhookUrl: string }).webhookUrl =
			'https://discord.test/webhook'

		await provider.send(makeMessage())

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const options = fetchMock.mock.calls[0][1] as RequestInit
		expect(options.signal).toBeInstanceOf(AbortSignal)
	})
})
