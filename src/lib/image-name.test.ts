import { describe, expect, it } from 'vitest'
import { parseImageReference, withTag } from './image-name'

describe('parseImageReference', () => {
	it('parses plain name with tag', () => {
		expect(parseImageReference('nginx:1.25')).toEqual({
			repository: 'nginx',
			tag: '1.25',
			isDigest: false
		})
	})

	it('defaults to latest without tag', () => {
		expect(parseImageReference('anoniemerd/prunemate')).toEqual({
			repository: 'anoniemerd/prunemate',
			tag: 'latest',
			isDigest: false
		})
	})

	it('parses registry with port and tag', () => {
		expect(parseImageReference('registry.local:5000/img:1.0')).toEqual({
			repository: 'registry.local:5000/img',
			tag: '1.0',
			isDigest: false
		})
	})

	it('parses registry with port without tag', () => {
		expect(parseImageReference('registry.local:5000/img')).toEqual({
			repository: 'registry.local:5000/img',
			tag: 'latest',
			isDigest: false
		})
	})

	it('parses digest references', () => {
		const ref = parseImageReference(
			'nginx@sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd'
		)
		expect(ref.repository).toBe('nginx')
		expect(ref.isDigest).toBe(true)
		expect(ref.tag).toBe('latest')
		expect(ref.digest).toBe(
			'sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd'
		)
	})
})

describe('withTag', () => {
	it('replaces the tag keeping registry host and port', () => {
		expect(withTag('registry.local:5000/img:1.0', '2.0')).toBe(
			'registry.local:5000/img:2.0'
		)
	})

	it('adds a tag when missing', () => {
		expect(withTag('nginx', '1.25')).toBe('nginx:1.25')
	})
})
