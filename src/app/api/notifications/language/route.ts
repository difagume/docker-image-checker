import { NextResponse } from 'next/server'
import {
	getPreferredLanguage,
	setPreferredLanguage
} from '@/lib/app-state'

export const dynamic = 'force-dynamic'

/**
 * GET: Get preferred language for notifications
 */
export async function GET() {
	try {
		const language = await getPreferredLanguage()
		return NextResponse.json({ language })
	} catch (error) {
		console.error('Error getting preferred language:', error)
		return NextResponse.json(
			{
				error: 'Failed to get preferred language',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}

/**
 * POST: Sync preferred language from client
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { language } = body

		if (!language || typeof language !== 'string') {
			return NextResponse.json(
				{ error: 'language must be a string' },
				{ status: 400 }
			)
		}

		// Validate language is one of the supported ones
		const validLanguages = ['en', 'es', 'pt']
		if (!validLanguages.includes(language)) {
			return NextResponse.json(
				{
					error: `Invalid language. Must be one of: ${validLanguages.join(', ')}`
				},
				{ status: 400 }
			)
		}

		await setPreferredLanguage(language)

		return NextResponse.json({
			success: true,
			message: 'Preferred language synced successfully',
			language
		})
	} catch (error) {
		console.error('Error syncing preferred language:', error)
		return NextResponse.json(
			{
				error: 'Failed to sync preferred language',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		)
	}
}
