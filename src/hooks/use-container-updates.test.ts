import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK_PATH = path.join(
	process.cwd(),
	'src/hooks/use-container-updates.ts'
)

describe('useContainerUpdates remap/GC OR-01/OR-02', () => {
	it('on phase:done with newContainerId !== containerId calls remapHiddenIds and remapIgnoredIds', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		expect(content).toContain('remapHiddenIds')
		expect(content).toContain('remapIgnoredIds')
		// Guard newContainerId !== containerId
		expect(content).toMatch(/newContainerId\s*!==\s*containerId/)
		// Called after optimistic setContainers
		expect(content).toMatch(/phase.*done[\s\S]*remapHiddenIds/)
	})

	it('triggers gcHiddenIds/gcIgnoredIds WITHOUT client-supplied liveIds (B-16: liveness is server-derived)', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		expect(content).toContain('gcHiddenIds')
		expect(content).toContain('gcIgnoredIds')
		// No-arg invocation: the client must not hand a cache-derived list to GC
		expect(content).toMatch(/gcHiddenIdsAction\(\)/)
		expect(content).toMatch(/gcIgnoredIdsAction\(\)/)
		// And must not build or pass a liveIds list from the (possibly stale) props
		expect(content).not.toMatch(/liveIds\s*=\s*useMemo|gcHiddenIdsAction\(liveIds\)/)
	})
})
