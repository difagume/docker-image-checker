import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

// Función para generar hash MD5 APR1 (Apache)
function generateApr1Md5(password: string, salt?: string): string {
	if (!salt) {
		// Generar un salt aleatorio de 8 caracteres
		const chars =
			'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
		salt = ''
		for (let i = 0; i < 8; i++) {
			salt += chars[Math.floor(Math.random() * chars.length)]
		}
	}

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

// Función para codificar bytes a base64 estilo Apache
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

// Función para generar hash Bcrypt
async function generateBcrypt(
	password: string,
	rounds: number = 10
): Promise<string> {
	try {
		const bcrypt = await import('bcryptjs')
		return await bcrypt.hash(password, rounds)
	} catch (error) {
		throw new Error('Error al generar hash bcrypt: bcryptjs no disponible')
	}
}

// Función para generar hash SHA1
function generateSha1(password: string): string {
	const hash = createHash('sha1').update(password).digest('base64')
	return `{SHA}${hash}`
}

export async function POST(request: NextRequest) {
	try {
		const {
			username,
			password,
			format = 'apr1',
			salt,
			rounds
		} = await request.json()

		if (!username || !password) {
			return Response.json(
				{ error: 'Faltan campos: username y password son requeridos' },
				{ status: 400 }
			)
		}

		let hash: string

		switch (format.toLowerCase()) {
			case 'apr1':
			case 'md5':
				hash = generateApr1Md5(password, salt)
				break
			case 'bcrypt':
				hash = await generateBcrypt(password, rounds || 10)
				break
			case 'sha':
			case 'sha1':
				hash = generateSha1(password)
				break
			default:
				return Response.json(
					{
						error:
							'Formato no soportado. Opciones: apr1, md5, bcrypt, sha, sha1'
					},
					{ status: 400 }
				)
		}

		const htpasswdEntry = `${username}:${hash}`

		return Response.json({
			htpasswd: htpasswdEntry,
			format: format.toLowerCase(),
			username,
			hash
		})
	} catch (error) {
		console.error('Error generando hash htpasswd:', error)
		return Response.json(
			{ error: 'Error interno del servidor' },
			{ status: 500 }
		)
	}
}

export async function GET() {
	return Response.json({
		message: 'API para generar hashes htpasswd',
		methods: {
			POST: {
				endpoint: '/api/htpasswd-hash',
				body: {
					username: 'string (requerido)',
					password: 'string (requerido)',
					format:
						'string (opcional, por defecto: apr1, opciones: apr1/md5, bcrypt, sha/sha1)',
					salt: 'string (opcional, solo para apr1)',
					rounds: 'number (opcional, solo para bcrypt, por defecto: 10)'
				},
				example: {
					curl: 'curl -X POST http://localhost:3000/api/htpasswd-hash -H "Content-Type: application/json" -d \'{"username": "admin", "password": "mipassword", "format": "apr1"}\''
				}
			}
		}
	})
}
