'use server'

import { revalidatePath } from 'next/cache'
import {
	getReferenceUrls,
	saveReferenceUrl as saveUrl
} from '@/lib/reference-url-manager'

export async function getReferenceUrlsAction() {
	try {
		return await getReferenceUrls()
	} catch (error) {
		console.error('Failed to get reference URLs:', error)
		return {}
	}
}

export async function saveReferenceUrlAction(imageName: string, url: string) {
	try {
		await saveUrl(imageName, url)
		revalidatePath('/')
		return { success: true }
	} catch (error) {
		console.error('Failed to save reference URL:', error)
		return { success: false, error: 'Failed to save reference URL' }
	}
}
