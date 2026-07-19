import { NextResponse } from 'next/server'
import docker from '@/lib/docker'

export async function GET() {
	const timestamp = Temporal.Now.instant().toString()
	
	try {
		// Ping Docker daemon to ensure connection is alive
		await docker.ping()

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
		return NextResponse.json(
			{
				status: 'degraded',
				timestamp,
				components: {
					app: { status: 'up' },
					docker: { 
						status: 'down', 
						error: error instanceof Error ? error.message : 'Unknown error' 
					}
				}
			},
			{ status: 500 }
		)
	}
}
