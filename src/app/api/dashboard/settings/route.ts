import { NextResponse } from 'next/server'
import {
	getDashboardSettings,
	setDashboardSettings
} from '@/lib/app-state'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET: Get dashboard settings
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

		const settings = await getDashboardSettings()
		return NextResponse.json(settings)
	} catch (error) {
		console.error('Error getting dashboard settings:', error)
		return NextResponse.json(
			{
				error: 'Failed to get dashboard settings',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}

/**
 * POST: Update dashboard settings
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
		const { activeFilters, showHiddenMode } = body

		await setDashboardSettings({ activeFilters, showHiddenMode })

		return NextResponse.json({
			success: true,
			message: 'Dashboard settings updated successfully'
		})
	} catch (error) {
		console.error('Error updating dashboard settings:', error)
		return NextResponse.json(
			{
				error: 'Failed to update dashboard settings',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
