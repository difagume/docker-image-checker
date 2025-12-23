import { createHash } from 'node:crypto'

/**
 * Valida credenciales contra una entrada htpasswd
 * Soporta formatos: MD5 (APR1), Bcrypt, SHA, Crypt
 */
export async function validateHtpasswd(
	username: string,
	password: string,
	htpasswdContent: string
): Promise<boolean> {
	// Parsear el contenido htpasswd
	const lines = htpasswdContent.split('\n').filter((line) => line.trim())

	for (const line of lines) {
		const [storedUsername, storedHash] = line.split(':')

		if (storedUsername === username) {
			return await verifyPassword(password, storedHash)
		}
	}

	return false
}

async function verifyPassword(
	password: string,
	hash: string
): Promise<boolean> {
	// MD5 (APR1) - más común en htpasswd
	if (hash.startsWith('$apr1$')) {
		return verifyApr1Md5(password, hash)
	}

	// Bcrypt
	if (
		hash.startsWith('$2y$') ||
		hash.startsWith('$2a$') ||
		hash.startsWith('$2b$')
	) {
		try {
			const bcrypt = await import('bcryptjs')
			return await bcrypt.compare(password, hash)
		} catch {
			console.error('bcryptjs no disponible')
			return false
		}
	}

	// SHA - {SHA}hash
	if (hash.startsWith('{SHA}')) {
		const shaHash = hash.substring(5)
		const computed = createHash('sha1').update(password).digest('base64')
		return computed === shaHash
	}

	// Crypt (DES) - legacy, no recomendado
	if (hash.length === 13) {
		console.warn('Crypt/DES no soportado - actualiza a MD5 o Bcrypt')
		return false
	}

	// Texto plano (solo para testing, NO usar en producción)
	console.warn('Comparando en texto plano - NO usar en producción')
	return password === hash
}

/**
 * Verifica password contra hash MD5 APR1 (Apache)
 * Implementación del algoritmo Apache MD5
 */
function verifyApr1Md5(password: string, hash: string): boolean {
	const parts = hash.split('$')
	if (parts.length !== 4 || parts[1] !== 'apr1') {
		return false
	}

	const salt = parts[2]
	const computed = apr1Md5(password, salt)

	return computed === hash
}

/**
 * Genera hash MD5 APR1 (algoritmo Apache)
 */
function apr1Md5(password: string, salt: string): string {
	const magic = '$apr1$'

	// Preparar el hash
	const ctx = createHash('md5')
	ctx.update(password + magic + salt)

	let ctx1 = createHash('md5')
	ctx1.update(password + salt + password)
	let final = ctx1.digest()

	for (let pl = password.length; pl > 0; pl -= 16) {
		ctx.update(final.subarray(0, pl > 16 ? 16 : pl))
	}

	for (let i = password.length; i !== 0; i >>>= 1) {
		if (i & 1) {
			ctx.update(Buffer.from([0]))
		} else {
			ctx.update(Buffer.from([password.charCodeAt(0)]))
		}
	}

	final = ctx.digest()

	// Iteraciones
	for (let i = 0; i < 1000; i++) {
		ctx1 = createHash('md5')

		if (i & 1) {
			ctx1.update(password)
		} else {
			ctx1.update(final)
		}

		if (i % 3) {
			ctx1.update(salt)
		}

		if (i % 7) {
			ctx1.update(password)
		}

		if (i & 1) {
			ctx1.update(final)
		} else {
			ctx1.update(password)
		}

		final = ctx1.digest()
	}

	// Codificar resultado
	const result = to64(final)

	return `${magic + salt}$${result}`
}

/**
 * Codifica bytes a base64 estilo Apache
 */
function to64(bytes: Buffer): string {
	const itoa64 =
		'./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	let result = ''

	const encode = (b1: number, b2: number, b3: number, n: number) => {
		let w = (b1 << 16) | (b2 << 8) | b3
		let out = ''
		for (let i = 0; i < n; i++) {
			out += itoa64[w & 0x3f]
			w >>= 6
		}
		return out
	}

	result += encode(bytes[0], bytes[6], bytes[12], 4)
	result += encode(bytes[1], bytes[7], bytes[13], 4)
	result += encode(bytes[2], bytes[8], bytes[14], 4)
	result += encode(bytes[3], bytes[9], bytes[15], 4)
	result += encode(bytes[4], bytes[10], bytes[5], 4)
	result += encode(0, 0, bytes[11], 2)

	return result
}
