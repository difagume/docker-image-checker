'use client'

import { useCallback, useEffect, useState } from 'react'
import {
	MAX_SAMPLES,
	type StatsSample,
	type StatsStatus
} from '@/lib/docker-stats'

type UseContainerStatsOptions = {
	containerId: string
	/** Cuando es false no se abre la conexión (por ejemplo, diálogo cerrado). */
	enabled?: boolean
}

export function useContainerStats({
	containerId,
	enabled = true
}: UseContainerStatsOptions) {
	const [samples, setSamples] = useState<StatsSample[]>([])
	const [status, setStatus] = useState<StatsStatus>('idle')
	const [attempt, setAttempt] = useState(0)

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt fuerza la reconexión manual del EventSource
	useEffect(() => {
		if (!enabled || !containerId) {
			setStatus('idle')
			return
		}

		setStatus('connecting')
		const url = `/api/containers/${encodeURIComponent(containerId)}/stats`
		const source = new EventSource(url)

		source.addEventListener('ready', () => setStatus('live'))

		source.addEventListener('stats', (event) => {
			const sample = JSON.parse((event as MessageEvent).data) as StatsSample
			setSamples((prev) => {
				const next = [...prev, sample]
				return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next
			})
		})

		source.addEventListener('failed', () => setStatus('error'))

		source.onerror = () => {
			// EventSource reintenta solo; reflejamos el estado mientras tanto.
			setStatus(
				source.readyState === EventSource.CLOSED ? 'error' : 'connecting'
			)
		}

		return () => {
			source.close()
			setStatus('closed')
			setSamples([])
		}
	}, [containerId, enabled, attempt])

	const reconnect = useCallback(() => {
		setSamples([])
		setAttempt((value) => value + 1)
	}, [])

	return { samples, status, reconnect }
}
