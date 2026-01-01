import { NextResponse } from 'next/server'
import {
	getHiddenContainerIds,
	setHiddenContainerIds
} from '@/lib/notifications/state-manager'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET: Get hidden container IDs
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

		const hiddenIds = await getHiddenContainerIds()
		return NextResponse.json({ hiddenContainerIds: hiddenIds })
	} catch (error) {
		console.error('Error getting hidden containers:', error)
		return NextResponse.json(
			{
				error: 'Failed to get hidden containers',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}

/**
 * POST: Sync hidden container IDs from client
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
		const { hiddenContainerIds } = body

		if (!Array.isArray(hiddenContainerIds)) {
			return NextResponse.json(
				{ error: 'hiddenContainerIds must be an array' },
				{ status: 400 }
			)
		}

		// Validate that all items are strings
		if (!hiddenContainerIds.every((id) => typeof id === 'string')) {
			return NextResponse.json(
				{ error: 'All container IDs must be strings' },
				{ status: 400 }
			)
		}

		await setHiddenContainerIds(hiddenContainerIds)

		return NextResponse.json({
			success: true,
			message: 'Hidden containers synced successfully',
			hiddenContainerIds
		})
	} catch (error) {
		console.error('Error syncing hidden containers:', error)
		return NextResponse.json(
			{
				error: 'Failed to sync hidden containers',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
