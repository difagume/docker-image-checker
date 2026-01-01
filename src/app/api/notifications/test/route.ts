import { NextResponse } from 'next/server'
import { getContainers, getImages } from '@/actions/docker'
import { checkAndNotify } from '@/lib/notifications/notification-service'

export const dynamic = 'force-dynamic'

/**
 * Test endpoint to manually trigger notification check
 * Useful for testing the notification system without waiting for cron
 */
export async function POST() {
	try {
		const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'

		if (!enabled) {
			return NextResponse.json(
				{
					error: 'Notifications are disabled',
					message: 'Set NOTIFICATIONS_ENABLED=true to enable notifications'
				},
				{ status: 400 }
			)
		}

		console.log('Manual notification check triggered via API')

		const containers = await getContainers()
		const images = await getImages()

		await checkAndNotify(containers, images)

		return NextResponse.json({
			success: true,
			message: 'Notification check completed',
			containersChecked: containers.length
		})
	} catch (error) {
		console.error('Error in test notification endpoint:', error)
		return NextResponse.json(
			{
				error: 'Failed to run notification check',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
