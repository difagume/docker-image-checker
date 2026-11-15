export interface RateLimitDecision {
	allowed: boolean
	retryAfterSeconds: number
}

interface RateLimitEntry {
	count: number
	resetAt: number
}

interface RateLimiterState {
	entries: Map<string, RateLimitEntry>
}

interface RateLimiterOptions {
	limit: number
	windowMs: number
}

const REGISTRY_KEY = '__rate_limiters__'
const MAX_ENTRIES = 5000

function getRegistry(): Map<string, RateLimiterState> {
	const g = globalThis as unknown as Record<string, unknown>
	let registry = g[REGISTRY_KEY] as Map<string, RateLimiterState> | undefined
	if (!registry) {
		registry = new Map()
		g[REGISTRY_KEY] = registry
	}
	return registry
}

export function createRateLimiter(name: string, options: RateLimiterOptions) {
	const registry = getRegistry()
	let instance = registry.get(name)
	if (!instance) {
		instance = { entries: new Map() }
		registry.set(name, instance)
	}
	const state = instance
	const { limit, windowMs } = options

	const activeEntry = (key: string, now: number): RateLimitEntry | null => {
		const entry = state.entries.get(key)
		if (!entry) return null
		if (entry.resetAt <= now) {
			state.entries.delete(key)
			return null
		}
		return entry
	}

	const blocked = (entry: RateLimitEntry, now: number): RateLimitDecision => ({
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
	})

	const prune = (now: number) => {
		if (state.entries.size < MAX_ENTRIES) return
		for (const [key, entry] of state.entries) {
			if (entry.resetAt <= now) state.entries.delete(key)
		}
	}

	return {
		check(key: string, now = Date.now()): RateLimitDecision {
			const entry = activeEntry(key, now)
			if (entry && entry.count >= limit) return blocked(entry, now)
			return { allowed: true, retryAfterSeconds: 0 }
		},
		consume(key: string, now = Date.now()): RateLimitDecision {
			prune(now)
			const entry = activeEntry(key, now)
			if (entry) {
				if (entry.count >= limit) return blocked(entry, now)
				entry.count += 1
				return { allowed: true, retryAfterSeconds: 0 }
			}
			state.entries.set(key, { count: 1, resetAt: now + windowMs })
			return { allowed: true, retryAfterSeconds: 0 }
		},
		reset(key: string) {
			state.entries.delete(key)
		}
	}
}
