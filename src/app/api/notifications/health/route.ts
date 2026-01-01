import { NextResponse } from 'next/server'
import { getEnabledProviders } from '@/lib/notifications/provider-factory'
import {
	getPreferredLanguage,
	loadState
} from '@/lib/notifications/state-manager'

export const dynamic = 'force-dynamic'

/**
 * Health check for notification system
 */
export async function GET() {
	try {
		const state = await loadState()
		const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'
		const schedule = process.env.NOTIFICATIONS_CRON_SCHEDULE || '0 */6 * * *'
		const language = await getPreferredLanguage()

		if (!enabled) {
			return NextResponse.json({
				enabled: false,
				message: 'Notifications are disabled'
			})
		}

		const providers = getEnabledProviders()
		const providerStatus = {
			telegram: {
				enabled: process.env.TELEGRAM_ENABLED === 'true',
				configured:
					!!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID
			},
			ntfy: {
				enabled: process.env.NTFY_ENABLED === 'true',
				configured: !!process.env.NTFY_TOPIC
			},
			discord: {
				enabled: process.env.DISCORD_ENABLED === 'true',
				configured: !!process.env.DISCORD_WEBHOOK_URL
			}
		}

		return NextResponse.json({
			enabled: true,
			status: 'running',
			schedule,
			language,
			providers: providerStatus,
			activeProvidersCount: providers.length,
			lastCheck: state.lastCheck,
			notifiedCount: Object.keys(state.notifiedUpdates).length
		})
	} catch (error) {
		console.error('Notification health check failed:', error)
		return NextResponse.json(
			{
				status: 'error',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
