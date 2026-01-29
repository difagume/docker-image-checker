'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

interface GhcrTokenToastProps {
	imageNames: string[]
	dict: {
		alerts: {
			ghcrTokenInvalid: {
				title: string
				description: string
			}
		}
	}
}

export function GhcrTokenToast({ imageNames, dict }: GhcrTokenToastProps) {
	useEffect(() => {
		if (imageNames.length > 0) {
			const imagesList = imageNames.join(', ')
			toast.warning(dict.alerts.ghcrTokenInvalid.title, {
				description: `${dict.alerts.ghcrTokenInvalid.description} ${imagesList}`
			})
		}
	}, [imageNames, dict])

	return null
}
