import { NextResponse } from 'next/server'
import {
	getIgnoredNotificationContainerIds,
	setIgnoredNotificationContainerIds
} from '@/lib/notifications/state-manager'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET: Get ignored notification container IDs
 */
export async function GET() {
	try {
		// Check authentication if enabled
		if (process.env.AUTH_HTPASSWD) {
			const session = await getSession()
			if (!session.isLoggedIn) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
			}
		}

		const ignoredIds = await getIgnoredNotificationContainerIds()
		return NextResponse.json({ ignoredNotificationIds: ignoredIds })
	} catch (error) {
		console.error('Error getting ignored notification containers:', error)
		return NextResponse.json(
			{
				error: 'Failed to get ignored notification containers',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}

/**
 * POST: Sync ignored notification container IDs from client
 */
export async function POST(request: Request) {
	try {
		// Check authentication if enabled
		if (process.env.AUTH_HTPASSWD) {
			const session = await getSession()
			if (!session.isLoggedIn) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
			}
		}

		const body = await request.json()
		const { ignoredNotificationIds } = body

		if (!Array.isArray(ignoredNotificationIds)) {
			return NextResponse.json(
				{ error: 'ignoredNotificationIds must be an array' },
				{ status: 400 }
			)
		}

		// Validate that all items are strings
		if (!ignoredNotificationIds.every((id) => typeof id === 'string')) {
			return NextResponse.json(
				{ error: 'All container IDs must be strings' },
				{ status: 400 }
			)
		}

		await setIgnoredNotificationContainerIds(ignoredNotificationIds)

		return NextResponse.json({
			success: true,
			message: 'Ignored notification containers synced successfully',
			ignoredNotificationIds
		})
	} catch (error) {
		console.error('Error syncing ignored notification containers:', error)
		return NextResponse.json(
			{
				error: 'Failed to sync ignored notification containers',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
