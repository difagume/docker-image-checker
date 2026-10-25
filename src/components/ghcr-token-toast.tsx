'use client'

import { useEffect, useRef } from 'react'
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

	// Read the toast texts through a ref so the effect depends only on
	// `imagesKey` and exhaustive-deps is satisfied without suppressions.
	const dictRef = useRef(dict)
	dictRef.current = dict

	useEffect(() => {
		if (imagesKey === '' || shownToastKeys.has(imagesKey)) return
		shownToastKeys.add(imagesKey)
		const { title, description } = dictRef.current.alerts.ghcrTokenInvalid
		toast.warning(title, { description: `${description} ${imagesKey}` })
	}, [imagesKey])

	return null
}
