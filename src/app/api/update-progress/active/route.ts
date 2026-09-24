import { unauthorizedResponseIfEnabled } from '@/lib/auth-guard'
import { progressStore } from '@/lib/update-progress-store'

/**
 * Read-only list of in-flight container update tasks keyed by container id.
 * `useContainerUpdates` calls it on mount (and after a duplicate-trigger
 * rejection) to re-attach SSE progress streams after a page reload. Uses the
 * same auth guard as the `/api/update-progress` SSE route.
 */
export async function GET() {
	const unauthorized = await unauthorizedResponseIfEnabled()
	if (unauthorized) return unauthorized

	return Response.json({ tasks: progressStore.listActive() })
}
