'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
	type LogLine,
	type LogStatus,
	MAX_BUFFER_LINES
} from '@/lib/docker-logs'

type UseContainerLogsOptions = {
	containerId: string
	/** Número de líneas históricas a pedir al conectar. */
	tail?: number
	/** Cuando es false no se abre la conexión (por ejemplo, diálogo cerrado). */
	enabled?: boolean
	/** En pausa las líneas nuevas se acumulan y no se pintan. */
	paused?: boolean
}

function cap(lines: LogLine[]): LogLine[] {
	return lines.length > MAX_BUFFER_LINES
		? lines.slice(lines.length - MAX_BUFFER_LINES)
		: lines
}

export function useContainerLogs({
	containerId,
	tail = 250,
	enabled = true,
	paused = false
}: UseContainerLogsOptions) {
	const [lines, setLines] = useState<LogLine[]>([])
	const [status, setStatus] = useState<LogStatus>('idle')
	const [pendingCount, setPendingCount] = useState(0)
	const [attempt, setAttempt] = useState(0)

	const pendingRef = useRef<LogLine[]>([])
	const pausedRef = useRef(paused)

	// Al reanudar, se vuelcan las líneas acumuladas durante la pausa.
	useEffect(() => {
		pausedRef.current = paused
		if (paused) return
		if (pendingRef.current.length === 0) return
		const buffered = pendingRef.current
		pendingRef.current = []
		setLines((prev) => cap([...prev, ...buffered]))
		setPendingCount(0)
	}, [paused])

	useEffect(() => {
		if (!enabled || !containerId) {
			setStatus('idle')
			return
		}

		setStatus('connecting')
		const url = `/api/containers/${encodeURIComponent(containerId)}/logs?tail=${tail}`
		const source = new EventSource(url)

		const push = (line: LogLine) => {
			if (pausedRef.current) {
				pendingRef.current = cap([...pendingRef.current, line])
				setPendingCount(pendingRef.current.length)
				return
			}
			setLines((prev) => cap([...prev, line]))
		}

		source.addEventListener('history', (event) => {
			const history = JSON.parse((event as MessageEvent).data) as LogLine[]
			setLines(cap(history))
		})

		source.addEventListener('ready', () => setStatus('live'))

		source.addEventListener('log', (event) => {
			push(JSON.parse((event as MessageEvent).data) as LogLine)
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
		}
	}, [containerId, tail, enabled, attempt])

	const clear = useCallback(() => {
		pendingRef.current = []
		setPendingCount(0)
		setLines([])
	}, [])

	const reconnect = useCallback(() => {
		pendingRef.current = []
		setPendingCount(0)
		setLines([])
		setAttempt((value) => value + 1)
	}, [])

	return {
		lines,
		status: paused && status === 'live' ? ('paused' as LogStatus) : status,
		pendingCount,
		clear,
		reconnect
	}
}
