import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CONTEXT_PATH = path.join(
	process.cwd(),
	'src/contexts/dashboard-context.tsx'
)

describe('DashboardProvider seeded HB-02/HB-03', () => {
	it('seeds useState(initial*) and does not fetch hidden/ignored via useEffect on mount', async () => {
		const content = await fs.readFile(CONTEXT_PATH, 'utf-8')

		// Seeded via useState(initial*)
		expect(content).toMatch(/useState<string\[]>\s*\(\s*initialHiddenIds/)
		expect(content).toMatch(/useState<string\[]>\s*\(\s*initialIgnoredIds/)
		expect(content).toMatch(/useState<Record<string, ReferenceUrlData>>\s*\(\s*initialReferenceUrls/)

		// useEffect mount fetch for hidden/ignored must be deleted — only toggle paths call set*Action
		// Count occurrences of getHiddenContainerIdsAction
		const hits = (content.match(/getHiddenContainerIdsAction/g) || []).length
		// Should be 0 or only in toggle? Task says toggle-only, but spec says MUST NOT fetch via useEffect when initial* provided.
		// Ideal is 0 hits in file, or at most not inside useEffect. For strict check, ensure hits === 0
		// However keep toggle path uses setHiddenContainerIdsAction, not get. So expect 0 get calls.
		expect(hits).toBe(0)

		const ignoredHits = (content.match(/getIgnoredNotificationContainerIdsAction/g) || []).length
		expect(ignoredHits).toBe(0)

		// Also ensure getReferenceUrlsAction not called on mount via useEffect (seeded)
		// The file should not contain useEffect that calls getReferenceUrlsAction for initial load
		// Allow saveReferenceUrlAction in save callback but not get in effect
		const getRefHits = (content.match(/getReferenceUrlsAction/g) || []).length
		expect(getRefHits).toBe(0)
	})

	it('isHidden/isIgnored use idsEqual prefix-aware', async () => {
		const content = await fs.readFile(CONTEXT_PATH, 'utf-8')
		expect(content).toContain('idsEqual')
		expect(content).toMatch(/from ['"]@\/lib\/container-id['"]/)
		// isHidden and isIgnored should use idsEqual
		expect(content).toMatch(/isHidden[\s\S]*idsEqual/)
		expect(content).toMatch(/isIgnored[\s\S]*idsEqual/)
	})
})
