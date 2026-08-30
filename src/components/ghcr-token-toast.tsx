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

// Module-level guard: React StrictMode (dev) mounts effects twice, and the
// dashboard can re-render the same list — one toast per distinct image set.
const shownToastKeys = new Set<string>()

export function GhcrTokenToast({ imageNames, dict }: GhcrTokenToastProps) {
	// Key by the joined list (primitives only) so the toast re-fires only when
	// the set of invalid-token images actually changes.
	const imagesKey = imageNames.join(', ')

	useEffect(() => {
		if (imageNames.length === 0 || shownToastKeys.has(imagesKey)) return
		shownToastKeys.add(imagesKey)
		toast.warning(dict.alerts.ghcrTokenInvalid.title, {
			description: `${dict.alerts.ghcrTokenInvalid.description} ${imagesKey}`
		})
		// biome-ignore lint/correctness/useExhaustiveDependencies: re-toast only when the image list itself changes
	}, [imagesKey])

	return null
}
