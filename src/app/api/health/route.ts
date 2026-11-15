import { NextResponse } from 'next/server'
import docker from '@/lib/docker'
import { getSession } from '@/lib/session'

async function canSeeDetails(): Promise<boolean> {
	if (!process.env.AUTH_HTPASSWD) return true
	try {
		const session = await getSession()
		return session.isLoggedIn === true
	} catch {
		return false
	}
}

export async function GET() {
	const timestamp = Temporal.Now.instant().toString()
	const detailed = await canSeeDetails()

	try {
		// Ping Docker daemon to ensure connection is alive
		await docker.ping()

		if (!detailed) {
			return NextResponse.json({ status: 'ok' }, { status: 200 })
		}

		return NextResponse.json(
			{
				status: 'ok',
				timestamp,
				components: {
					app: { status: 'up' },
					docker: { status: 'up' }
				}
			},
			{ status: 200 }
		)
	} catch (error) {
		console.error('Health check failed:', error)
		if (!detailed) {
			return NextResponse.json({ status: 'degraded' }, { status: 500 })
		}
		return NextResponse.json(
			{
				status: 'degraded',
				timestamp,
				components: {
					app: { status: 'up' },
					docker: {
						status: 'down',
						error: 'Docker daemon unreachable'
					}
				}
			},
			{ status: 500 }
		)
	}
}
