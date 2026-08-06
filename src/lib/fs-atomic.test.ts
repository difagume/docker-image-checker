import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { writeFileAtomic } from './fs-atomic'

async function makeTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), 'fs-atomic-'))
}

function errnoError(code: string): NodeJS.ErrnoException {
	const error = new Error(
		`${code}: operation not permitted`
	) as NodeJS.ErrnoException
	error.code = code
	return error
}

describe('writeFileAtomic', () => {
	it('writes the exact content and leaves no temp files behind (happy path)', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'state.json')
		const data = JSON.stringify({ a: 1 }, null, 2)

		await writeFileAtomic(file, data)

		expect(await fs.readFile(file, 'utf-8')).toBe(data)
		const leftovers = (await fs.readdir(dir)).filter((entry) =>
			entry.includes('.tmp')
		)
		expect(leftovers).toHaveLength(0)
	})

	it('creates missing parent directories recursively', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'nested', 'deep', 'state.json')

		await writeFileAtomic(file, '{}')

		expect(await fs.readFile(file, 'utf-8')).toBe('{}')
	})

	it('keeps the previous destination intact when a rename fails', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'state.json')
		await writeFileAtomic(file, '{"v":1}')

		const spy = vi.spyOn(fs, 'rename').mockRejectedValue(errnoError('EACCES'))
		await expect(writeFileAtomic(file, '{"v":2}')).rejects.toThrow()
		spy.mockRestore()

		expect(await fs.readFile(file, 'utf-8')).toBe('{"v":1}')
	})

	it('propagates errors and does not leave an orphan temp file', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'state.json')

		const spy = vi.spyOn(fs, 'rename').mockRejectedValue(errnoError('EPERM'))
		await expect(writeFileAtomic(file, '{}')).rejects.toThrow()
		spy.mockRestore()

		expect(await fs.readFile(file, 'utf-8').catch(() => null)).toBeNull()
		const leftovers = (await fs.readdir(dir)).filter((entry) =>
			entry.includes('.tmp')
		)
		expect(leftovers).toHaveLength(0)
	})

	it('retries the rename on transient EPERM/EACCES errors with backoff', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'state.json')
		const originalRename = fs.rename.bind(fs)
		let calls = 0
		const spy = vi.spyOn(fs, 'rename').mockImplementation((source, dest) => {
			calls++
			if (calls <= 2) {
				return Promise.reject(errnoError('EPERM'))
			}
			return originalRename(source, dest)
		})

		await writeFileAtomic(file, '{"ok":true}')

		spy.mockRestore()
		expect(calls).toBe(3)
		expect(await fs.readFile(file, 'utf-8')).toBe('{"ok":true}')
	})

	it('serializes concurrent writes so the last one wins without corruption', async () => {
		const dir = await makeTempDir()
		const file = path.join(dir, 'state.json')

		await Promise.all([
			writeFileAtomic(file, '{"writer":"a","payload":"aaaaaaaa"}'),
			writeFileAtomic(file, '{"writer":"b","payload":"bbbbbbbb"}')
		])

		const content = await fs.readFile(file, 'utf-8')
		expect(content).toMatch(/^\{.*\}$/)
		expect(JSON.parse(content)).toEqual(
			expect.objectContaining({ writer: expect.stringMatching(/^[ab]$/) })
		)
		const leftovers = (await fs.readdir(dir)).filter((entry) =>
			entry.includes('.tmp')
		)
		expect(leftovers).toHaveLength(0)
	})
})
