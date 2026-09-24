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
		// Never scan build artifacts (e.g. .next/standalone copies of src) or
		// nested git worktree checkouts (.kilo/worktrees/*): those duplicate
		// copies of src/ tests run concurrently against the same state file
		// and race each other into spurious failures.
		exclude: [...configDefaults.exclude, '**/.next/**', '**/.kilo/worktrees/**']
	}
})
