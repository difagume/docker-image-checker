import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DASHBOARD_CONTENT_PATH = path.join(
	process.cwd(),
	'src/components/dashboard-content.tsx'
)

describe('DashboardContent server-inject HB-01', () => {
	it('fetches hidden/ignored/referenceUrls in parallel with updateStates and injects initial* props', async () => {
		const content = await fs.readFile(DASHBOARD_CONTENT_PATH, 'utf-8')

		// Must parallel fetch alongside getContainerUpdateStates
		expect(content).toContain('getHiddenContainerIds')
		expect(content).toContain('getIgnoredNotificationContainerIds')
		expect(content).toContain('getReferenceUrls')
		expect(content).toContain('getContainerUpdateStates')
		// Parallel Promise.all
		expect(content).toMatch(/Promise\.all\s*\(\s*\[/)

		// Must pass initial* to DashboardProvider
		expect(content).toContain('initialHiddenIds')
		expect(content).toContain('initialIgnoredIds')
		expect(content).toContain('initialReferenceUrls')

		// Must stay inside DashboardGate Suspense (page.tsx zero instant)
		// Ensure no instant=false in dashboard-content
		expect(content).not.toContain('instant')
	})

	it('imports hidden/ignored helpers from app-state and reference-url-manager', async () => {
		const content = await fs.readFile(DASHBOARD_CONTENT_PATH, 'utf-8')
		expect(content).toMatch(/from ['"]@\/lib\/app-state['"]/)
		expect(content).toMatch(/from ['"]@\/lib\/reference-url-manager['"]|getReferenceUrls/)
	})
})
