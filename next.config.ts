import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	cacheComponents: true,
	output: 'standalone',
	poweredByHeader: false,
	reactCompiler: true,
	logging: {
		// Forward browser warnings and errors to the terminal (Next.js 16.2+)
		browserToTerminal: 'warn'
	},
	experimental: {
		optimizePackageImports: ['lucide-react'],
		// Native Rust port of the React Compiler running inside Turbopack (Next.js 16.3+)
		turbopackRustReactCompiler: true
	},
	serverExternalPackages: ['dockerode', 'ssh2', 'cpu-features'],
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=63072000; includeSubDomains; preload'
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff'
					},
					{
						key: 'X-Frame-Options',
						value: 'SAMEORIGIN'
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block'
					},
					{
						key: 'Referrer-Policy',
						value: 'origin-when-cross-origin'
					}
				]
			}
		]
	}
}

export default nextConfig
