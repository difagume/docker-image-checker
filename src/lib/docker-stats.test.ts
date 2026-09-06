import { describe, expect, it } from 'vitest'
import {
	computeCpuPercent,
	computeMemoryUsage,
	formatBytes,
	formatPercent,
	type RawDockerStats,
	sparklinePoints,
	toStatsSample
} from './docker-stats'

const SAMPLE: RawDockerStats = {
	read: '2026-09-06T12:00:00.000000000Z',
	cpu_stats: {
		cpu_usage: { total_usage: 2_000_000_000 },
		system_cpu_usage: 100_000_000_000,
		online_cpus: 4
	},
	precpu_stats: {
		cpu_usage: { total_usage: 1_000_000_000 },
		system_cpu_usage: 99_000_000_000
	},
	memory_stats: {
		usage: 60 * 1024 * 1024,
		limit: 1024 * 1024 * 1024,
		stats: { inactive_file: 10 * 1024 * 1024 }
	},
	networks: {
		eth0: { rx_bytes: 1000, tx_bytes: 500 },
		eth1: { rx_bytes: 250, tx_bytes: 100 }
	},
	blkio_stats: {
		io_service_bytes_recursive: [
			{ op: 'Read', value: 2048 },
			{ op: 'Write', value: 1024 }
		]
	}
}

describe('computeCpuPercent', () => {
	it('applies the docker stats formula normalized by online cores', () => {
		// delta cpu = 1e9, delta system = 1e9, 4 cores → 400%
		expect(computeCpuPercent(SAMPLE)).toBeCloseTo(400)
	})

	it('returns 0 without a previous sample to diff against', () => {
		expect(computeCpuPercent({ cpu_stats: SAMPLE.cpu_stats })).toBe(0)
	})

	it('returns 0 when the system delta is not positive', () => {
		expect(
			computeCpuPercent({
				cpu_stats: { cpu_usage: { total_usage: 5 }, system_cpu_usage: 10 },
				precpu_stats: { cpu_usage: { total_usage: 1 }, system_cpu_usage: 10 }
			})
		).toBe(0)
	})

	it('falls back to percpu_usage length when online_cpus is missing', () => {
		expect(
			computeCpuPercent({
				cpu_stats: {
					cpu_usage: {
						total_usage: 2_000_000_000,
						percpu_usage: [1, 2, 3, 4, 5, 6, 7, 8]
					},
					system_cpu_usage: 100_000_000_000
				},
				precpu_stats: {
					cpu_usage: { total_usage: 1_000_000_000 },
					system_cpu_usage: 99_000_000_000
				}
			})
		).toBeCloseTo(800)
	})
})

describe('computeMemoryUsage', () => {
	it('discounts inactive_file (cgroups v2)', () => {
		expect(computeMemoryUsage(SAMPLE)).toBe(50 * 1024 * 1024)
	})

	it('discounts cache when inactive_file is absent (cgroups v1)', () => {
		expect(
			computeMemoryUsage({
				memory_stats: {
					usage: 300,
					stats: { cache: 100 }
				}
			})
		).toBe(200)
	})

	it('returns 0 without memory stats', () => {
		expect(computeMemoryUsage({})).toBe(0)
	})
})

describe('toStatsSample', () => {
	it('maps raw docker stats to a sample with aggregated network and disk', () => {
		const sample = toStatsSample(SAMPLE, 1)
		expect(sample).not.toBeNull()
		expect(sample?.id).toBe(1)
		expect(sample?.ts).toBe(Date.parse('2026-09-06T12:00:00.000Z'))
		expect(sample?.cpuPercent).toBeCloseTo(400)
		expect(sample?.memUsage).toBe(50 * 1024 * 1024)
		expect(sample?.memLimit).toBe(1024 * 1024 * 1024)
		expect(sample?.netRx).toBe(1250)
		expect(sample?.netTx).toBe(600)
		expect(sample?.blockRead).toBe(2048)
		expect(sample?.blockWrite).toBe(1024)
	})

	it('returns null for an empty payload', () => {
		expect(toStatsSample({}, 1)).toBeNull()
	})
})

describe('formatBytes', () => {
	it('formats binary units', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(512)).toBe('512 B')
		expect(formatBytes(1024)).toBe('1.0 KiB')
		expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MiB')
		expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GiB')
	})

	it('drops decimals above 100 or for bytes', () => {
		expect(formatBytes(150 * 1024)).toBe('150 KiB')
	})
})

describe('formatPercent', () => {
	it('formats one decimal', () => {
		expect(formatPercent(12.34)).toBe('12.3%')
		expect(formatPercent(0)).toBe('0.0%')
	})
})

describe('sparklinePoints', () => {
	it('returns null with fewer than 2 points', () => {
		expect(sparklinePoints([])).toBeNull()
		expect(sparklinePoints([5])).toBeNull()
	})

	it('normalizes to the series peak and spans the full width', () => {
		const points = sparklinePoints([0, 10, 5], 100, 24)
		expect(points).not.toBeNull()
		const coords = (points as string).split(' ')
		expect(coords).toHaveLength(3)
		expect(coords[0]).toBe('0.0,23.0')
		expect(coords[1]).toBe('50.0,1.0')
	})

	it('survives an all-zero series', () => {
		expect(sparklinePoints([0, 0, 0])).not.toBeNull()
	})
})
