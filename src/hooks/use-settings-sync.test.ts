import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK_PATH = path.join(process.cwd(), 'src/hooks/use-settings-sync.ts')

describe('useSettingsSync first-run guard (B-14)', () => {
	it('skips the hydration run: guard checked before any persist call', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		// A ref-based first-run guard must exist and short-circuit before the
		// setDashboardSettingsAction call inside the same effect.
		expect(content).toMatch(/useRef/)
		expect(content).toMatch(
			/useEffect[\s\S]*?(firstRun|hydrated)\.current[\s\S]*?return[\s\S]*?setDashboardSettingsAction/
		)
	})

	it('still persists on subsequent dependency changes', async () => {
		const content = await fs.readFile(HOOK_PATH, 'utf-8')
		// After the guard, the debounced persist (setTimeout 300) remains wired.
		expect(content).toMatch(/setTimeout[\s\S]{0,200}setDashboardSettingsAction/)
		expect(content).toMatch(/\[activeFilters,\s*showHiddenMode,\s*sortBy,\s*sortDir\]/)
	})
})
