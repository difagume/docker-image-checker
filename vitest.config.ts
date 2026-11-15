import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	test: {
		environment: 'node',
		// Never scan build artifacts (e.g. .next/standalone copies of src), nested
		// git worktree checkouts (.kilo/worktrees/*), or agent skill directories
		// (.agents/.qoder/.roo) whose validator .test.cjs files are not Vitest
		// suites: those copies of src/ tests run concurrently against the same
		// state file and race each other into spurious failures.
		exclude: [
			...configDefaults.exclude,
			'**/.next/**',
			'**/.kilo/worktrees/**',
			'**/.agents/**',
			'**/.qoder/**',
			'**/.roo/**'
		]
	}
})
