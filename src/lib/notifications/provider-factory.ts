import type { NotificationProvider } from '@/types/app-state'
import { DiscordNotificationProvider } from './providers/discord'
import { NtfyNotificationProvider } from './providers/ntfy'
import { TelegramNotificationProvider } from './providers/telegram'

/**
 * Get all enabled and valid notification providers
 */
export function getEnabledProviders(): NotificationProvider[] {
	const providers: NotificationProvider[] = []

	// Initialize all providers
	const telegram = new TelegramNotificationProvider()
	const ntfy = new NtfyNotificationProvider()
	const discord = new DiscordNotificationProvider()

	// Add enabled and valid providers
	if (telegram.enabled && telegram.validate()) {
		providers.push(telegram)
	}

	if (ntfy.enabled && ntfy.validate()) {
		providers.push(ntfy)
	}

	if (discord.enabled && discord.validate()) {
		providers.push(discord)
	}

	return providers
}

/**
 * Validate all enabled providers
 */
export function validateProviders(): {
	valid: boolean
	errors: string[]
} {
	const errors: string[] = []
	const providers = [
		new TelegramNotificationProvider(),
		new NtfyNotificationProvider(),
		new DiscordNotificationProvider()
	]

	for (const provider of providers) {
		if (provider.enabled && !provider.validate()) {
			errors.push(
				`${provider.name} provider is enabled but not properly configured`
			)
		}
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

/**
 * Get provider status for all providers
 */
export function getProviderStatus() {
	const telegram = new TelegramNotificationProvider()
	const ntfy = new NtfyNotificationProvider()
	const discord = new DiscordNotificationProvider()

	return {
		telegram: {
			enabled: telegram.enabled,
			configured: telegram.validate()
		},
		ntfy: {
			enabled: ntfy.enabled,
			configured: ntfy.validate()
		},
		discord: {
			enabled: discord.enabled,
			configured: discord.validate()
		}
	}
}
