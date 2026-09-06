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
		// Never scan build artifacts (e.g. .next/standalone copies of src).
		exclude: [...configDefaults.exclude, '**/.next/**']
	}
})
