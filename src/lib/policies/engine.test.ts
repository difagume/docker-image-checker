import { describe, expect, it } from 'vitest'
import { evaluatePolicies } from './engine'
import type { ImageContext } from './types'

function remoteTagList(names: string[]) {
	return names.map((tag) => ({ tag, digest: `sha256:${tag}` }))
}

describe('SemverPolicy latestCompatible (mismo núcleo semver, distinto sufijo)', () => {
	it('fnsys/dockhand: prefiere v1.0.22 frente a v1.0.22-baseline si la actual es v1.0.21', () => {
		const ctx: ImageContext = {
			imageName: 'fnsys/dockhand:v1.0.21',
			currentTag: 'v1.0.21',
			currentDigest: '',
			remoteTags: remoteTagList(['v1.0.22-baseline', 'v1.0.22'])
		}
		const r = evaluatePolicies(ctx)
		expect(r.state).toBe('NEW_COMPATIBLE_VERSION_AVAILABLE')
		expect(r.details?.latestCompatible).toBe('v1.0.22')
	})

	it('valkey/valkey: prefiere 9.1-alpine frente a 9.1-alpine3.23 si la actual es 9.0.3-alpine', () => {
		const ctx: ImageContext = {
			imageName: 'valkey/valkey:9.0.3-alpine',
			currentTag: '9.0.3-alpine',
			currentDigest: '',
			remoteTags: remoteTagList(['9.1-alpine3.23', '9.1-alpine'])
		}
		const r = evaluatePolicies(ctx)
		expect(r.state).toBe('NEW_COMPATIBLE_VERSION_AVAILABLE')
		expect(r.details?.latestCompatible).toBe('9.1-alpine')
	})

	it('redis: prefiere 8.6.1 frente a 8.6.1-trixie si la actual es 8.4.0', () => {
		const ctx: ImageContext = {
			imageName: 'redis:8.4.0',
			currentTag: '8.4.0',
			currentDigest: '',
			remoteTags: remoteTagList(['8.6.1-trixie', '8.6.1'])
		}
		const r = evaluatePolicies(ctx)
		expect(r.state).toBe('NEW_COMPATIBLE_VERSION_AVAILABLE')
		expect(r.details?.latestCompatible).toBe('8.6.1')
	})

	// library/postgres (Docker Hub v2 tags?page_size=70): en la primera página,
	// 16.13-trixie aparece antes (índice ~5) que 16.13-alpine (~34). Sin desempate
	// por sufijo, un sort solo por minor/patch dejaba ganar al primero en la lista.
	it('postgres: prefiere 16.13-alpine frente a 16.13-trixie si la actual es 16-alpine', () => {
		const ctx: ImageContext = {
			imageName: 'postgres:16-alpine',
			currentTag: '16-alpine',
			currentDigest: '',
			// Orden como en la API: trixie antes que alpine
			remoteTags: remoteTagList(['16.13-trixie', '16.13', '16.13-alpine'])
		}
		const r = evaluatePolicies(ctx)
		expect(r.state).toBe('NEW_COMPATIBLE_VERSION_AVAILABLE')
		expect(r.details?.latestCompatible).toBe('16.13-alpine')
	})
})
