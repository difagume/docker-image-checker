import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	alreadyNotifiedFresh,
	gcHiddenIds,
	gcIgnoredIds,
	getHiddenContainerIds,
	getIgnoredNotificationContainerIds,
	hasBeenNotified,
	idsEqual,
	loadState,
	markAsNotified,
	remapHiddenIds,
	remapIgnoredIds,
	runExclusive,
	setHiddenContainerIds,
	setIgnoredNotificationContainerIds
} from './app-state'

// Under NODE_ENV=test (set automatically by vitest) app-state resolves its
// default file to the OS temp dir, so tests never touch the real data/ file.
// Only cleanup between tests is needed since the path is fixed per run.
const TEST_STATE_FILE = path.join(
	os.tmpdir(),
	'docker-image-checker-test',
	'dashboard-state.json'
)

beforeEach(async () => {
	await fs.rm(TEST_STATE_FILE, { force: true })
})

afterEach(async () => {
	await fs.rm(TEST_STATE_FILE, { force: true })
})

describe('idsEqual', () => {
	it('matches identical 64-char ids', () => {
		const id64 = 'a'.repeat(64)
		expect(idsEqual(id64, id64)).toBe(true)
	})

	it('matches 64-char vs 12-char prefix (long starts with short)', () => {
		const long = 'abc123def456'.repeat(5) + 'xxxx' // 64 chars
		const short = long.slice(0, 12)
		expect(idsEqual(long, short)).toBe(true)
	})

	it('matches 12-char vs 64-char prefix (short vs long)', () => {
		const long = 'abc123def456'.repeat(5) + 'xxxx'
		const short = long.slice(0, 12)
		expect(idsEqual(short, long)).toBe(true)
	})

	it('returns false for non-matching ids', () => {
		expect(idsEqual('abc123def456', 'xyz789uvw012')).toBe(false)
	})

	it('handles empty strings', () => {
		expect(idsEqual('', '')).toBe(true)
		expect(idsEqual('', 'abc')).toBe(false)
		expect(idsEqual('abc', '')).toBe(false)
	})
})

describe('runExclusive', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('serialises concurrent operations (last wins, no interleave)', async () => {
		const order: string[] = []
		const op1 = runExclusive(async () => {
			order.push('op1-start')
			await new Promise((r) => setTimeout(r, 20))
			order.push('op1-end')
			return 'op1'
		})
		const op2 = runExclusive(async () => {
			order.push('op2-start')
			await new Promise((r) => setTimeout(r, 10))
			order.push('op2-end')
			return 'op2'
		})

		const results = await Promise.all([op1, op2])
		expect(results).toEqual(['op1', 'op2'])
		// op2 must start after op1 ends (serialised)
		expect(order).toEqual(['op1-start', 'op1-end', 'op2-start', 'op2-end'])
	})

	it('releases mutex after EACCES failure so next op succeeds', async () => {
		const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' })
		await expect(
			runExclusive(async () => {
				throw eacces
			})
		).rejects.toMatchObject({ code: 'EACCES' })

		// Next operation must still succeed (mutex not poisoned)
		const result = await runExclusive(async () => 'ok')
		expect(result).toBe('ok')
	})
})

describe('remapHiddenIds', () => {
	beforeEach(async () => {
		await setHiddenContainerIds([])
		await setIgnoredNotificationContainerIds([])
	})

	it('preserves order ["a","old","c"] -> ["a","new","c"]', async () => {
		await setHiddenContainerIds(['a', 'old', 'c'])
		await remapHiddenIds('old', 'new')
		expect(await getHiddenContainerIds()).toEqual(['a', 'new', 'c'])
	})

	it('deduplicates ["old","new"] -> ["new"]', async () => {
		await setHiddenContainerIds(['old', 'new'])
		await remapHiddenIds('old', 'new')
		expect(await getHiddenContainerIds()).toEqual(['new'])
	})

	it('no-ops when old absent', async () => {
		await setHiddenContainerIds(['a', 'b'])
		await remapHiddenIds('missing', 'new')
		expect(await getHiddenContainerIds()).toEqual(['a', 'b'])
	})

	it('no-ops when old === new', async () => {
		await setHiddenContainerIds(['a', 'b'])
		await remapHiddenIds('a', 'a')
		expect(await getHiddenContainerIds()).toEqual(['a', 'b'])
	})

	it('12-char old matches 64-char live and stores canonical 64-char newId', async () => {
		const longOld = 'abc123def456'.repeat(5) + 'xxxx' // 64
		const shortOld = longOld.slice(0, 12)
		const longNew = 'zzz999yyy888'.repeat(5) + 'yyyy'
		await setHiddenContainerIds([shortOld, 'other'])
		await remapHiddenIds(shortOld, longNew)
		// Should replace shortOld with canonical longNew preserving position
		expect(await getHiddenContainerIds()).toEqual([longNew, 'other'])
	})

	it('also handles long stored id matched by short old arg', async () => {
		const longOld = 'abc123def456'.repeat(5) + 'xxxx'
		const shortOld = longOld.slice(0, 12)
		const longNew = 'zzz999yyy888'.repeat(5) + 'yyyy'
		await setHiddenContainerIds([longOld])
		await remapHiddenIds(shortOld, longNew)
		expect(await getHiddenContainerIds()).toEqual([longNew])
	})
})

describe('remapIgnoredIds', () => {
	beforeEach(async () => {
		await setIgnoredNotificationContainerIds([])
		await setHiddenContainerIds([])
	})

	it('preserves order and dedup for ignored list', async () => {
		await setIgnoredNotificationContainerIds(['a', 'old', 'c'])
		await remapIgnoredIds('old', 'new')
		expect(await getIgnoredNotificationContainerIds()).toEqual([
			'a',
			'new',
			'c'
		])

		await setIgnoredNotificationContainerIds(['old', 'new'])
		await remapIgnoredIds('old', 'new')
		expect(await getIgnoredNotificationContainerIds()).toEqual(['new'])
	})
})

describe('gcHiddenIds', () => {
	beforeEach(async () => {
		await setHiddenContainerIds([])
	})

	it('shrinks ["live","orphan"] with live=["live"] to ["live"]', async () => {
		await setHiddenContainerIds(['live', 'orphan'])
		const mutated = await gcHiddenIds(['live'])
		expect(mutated).toBe(true)
		expect(await getHiddenContainerIds()).toEqual(['live'])
	})

	it('idempotent no-write-if-clean returns false and keeps list', async () => {
		await setHiddenContainerIds(['live'])
		const mutated = await gcHiddenIds(['live'])
		expect(mutated).toBe(false)
		expect(await getHiddenContainerIds()).toEqual(['live'])
	})

	it('empty live [] -> [] removes all', async () => {
		await setHiddenContainerIds(['a', 'b'])
		const mutated = await gcHiddenIds([])
		expect(mutated).toBe(true)
		expect(await getHiddenContainerIds()).toEqual([])
	})

	it('prefix-aware 12 vs 64 keeps matching entries', async () => {
		const longLive = 'abc123def456'.repeat(5) + 'xxxx'
		const shortStored = longLive.slice(0, 12)
		await setHiddenContainerIds([shortStored, 'orphan'])
		const mutated = await gcHiddenIds([longLive])
		expect(mutated).toBe(true)
		expect(await getHiddenContainerIds()).toEqual([shortStored])
	})

	it('keeps 64 stored when live is 12 prefix', async () => {
		const longStored = 'abc123def456'.repeat(5) + 'xxxx'
		const shortLive = longStored.slice(0, 12)
		await setHiddenContainerIds([longStored, 'orphan'])
		const mutated = await gcHiddenIds([shortLive])
		expect(mutated).toBe(true)
		expect(await getHiddenContainerIds()).toEqual([longStored])
	})
})

describe('gcIgnoredIds', () => {
	beforeEach(async () => {
		await setIgnoredNotificationContainerIds([])
	})

	it('shrinks ignored list against liveIds prefix-aware', async () => {
		const longLive = 'abc123def456'.repeat(5) + 'xxxx'
		const shortStored = longLive.slice(0, 12)
		await setIgnoredNotificationContainerIds([shortStored, 'orphan2'])
		const mutated = await gcIgnoredIds([longLive])
		expect(mutated).toBe(true)
		expect(await getIgnoredNotificationContainerIds()).toEqual([shortStored])
	})
})

	describe('alreadyNotifiedFresh (B-07 / fix-notify-race)', () => {
	const update = {
		containerName: 'fresh-test',
		imageName: 'nginx',
		currentVersion: '1.0.0',
		latestVersion: '1.2.3',
		latestDigest: 'sha256:freshdigest',
		imageDigest: 'sha256:localdigest',
		dockerContainerId: 'deadbeefcafe1234',
		fullImageName: 'nginx:1.2.3'
	}

	it('is false before markAsNotified and true after (fresh read, not snapshot)', async () => {
		const snapshot = await loadState()
		expect(hasBeenNotified(snapshot, update)).toBe(false)
		expect(await alreadyNotifiedFresh(update)).toBe(false)

		await markAsNotified(update)
		expect(await alreadyNotifiedFresh(update)).toBe(true)
	})
})
