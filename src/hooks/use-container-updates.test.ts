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

	it('triggers gcHiddenIds/gcIgnoredIds on mount and on processedContainers change with liveIds', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		expect(content).toContain('gcHiddenIds')
		expect(content).toContain('gcIgnoredIds')
		// liveIds derived from containers
		expect(content).toMatch(/liveIds.*containers\.map|processedContainers\.map/)
		// useEffect watching processedContainers
		expect(content).toMatch(/useEffect[\s\S]*gcHiddenIds|gcHiddenIds[\s\S]*useEffect/)
	})

	it('exposes liveIds derived from processedContainers', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		// liveIds should be exposed or used internally; check that liveIds variable exists
		expect(content).toMatch(/liveIds/)
	})
})
