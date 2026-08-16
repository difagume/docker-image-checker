'use server'

import { requireAuthIfEnabled } from '@/lib/auth-guard'
import {
	getReferenceUrls,
	saveReferenceUrl as saveUrl
} from '@/lib/reference-url-manager'

export async function getReferenceUrlsAction() {
	await requireAuthIfEnabled()
	try {
		return await getReferenceUrls()
	} catch (error) {
		console.error('Failed to get reference URLs:', error)
		return {}
	}
}

export async function saveReferenceUrlAction(imageName: string, url: string) {
	await requireAuthIfEnabled()
	try {
		await saveUrl(imageName, url)
		return { success: true }
	} catch (error) {
		console.error('Failed to save reference URL:', error)
		return { success: false, error: 'Failed to save reference URL' }
	}
}
