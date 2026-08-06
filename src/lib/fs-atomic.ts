import fs from 'node:fs/promises'
import path from 'node:path'

const RENAME_RETRIES = 5
const RENAME_RETRY_BASE_MS = 25

/**
 * Per-file write mutex. Serializes concurrent writes to the same destination so
 * the last one wins without interleaving/corruption. The stored slot never
 * rejects, so a failed write does not poison the chain for later writes.
 */
const mutexes = new Map<string, Promise<void>>()

function isRetryableRenameError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return false
	}
	const code = (error as NodeJS.ErrnoException).code
	return code === 'EPERM' || code === 'EACCES'
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function renameWithRetry(
	tempPath: string,
	destinationPath: string
): Promise<void> {
	for (let attempt = 1; attempt <= RENAME_RETRIES; attempt++) {
		try {
			await fs.rename(tempPath, destinationPath)
			return
		} catch (error) {
			if (!isRetryableRenameError(error) || attempt === RENAME_RETRIES) {
				throw error
			}
			// Windows antivirus/file-watchers can hold the destination briefly:
			// linear backoff (25ms * attempt), bounded to 5 attempts.
			await delay(RENAME_RETRY_BASE_MS * attempt)
		}
	}
}

/**
 * Atomically writes `data` to `filePath` via temp file + rename in the same
 * directory (temp and destination share the filesystem → rename is atomic).
 *
 * - Creates missing parent directories.
 * - Serializes concurrent writes to the same file (last writer wins).
 * - Retries the rename on transient EPERM/EACCES (Windows).
 * - Removes the temp file on failure and propagates the error.
 *
 * Errors are propagated to the caller (REQ-05); the cache never stores error
 * states.
 */
export async function writeFileAtomic(
	filePath: string,
	data: string
): Promise<void> {
	const absolutePath = path.resolve(filePath)
	const tempPath = path.join(
		path.dirname(absolutePath),
		`.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`
	)

	const previous = mutexes.get(absolutePath) ?? Promise.resolve()
	const operation = previous.then(async () => {
		await fs.mkdir(path.dirname(absolutePath), { recursive: true })
		try {
			await fs.writeFile(tempPath, data, 'utf-8')
			await renameWithRetry(tempPath, absolutePath)
		} catch (error) {
			await fs.rm(tempPath, { force: true }).catch(() => {})
			throw error
		}
	})

	// Never let a failed write poison the mutex chain for later writes.
	mutexes.set(
		absolutePath,
		operation.catch(() => {})
	)

	return operation
}
