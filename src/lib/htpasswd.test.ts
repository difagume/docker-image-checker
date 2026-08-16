import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { validateHtpasswd } from './htpasswd'

// Vector conocido: htpasswd -nbm user myPassword
const APR1 = 'user:$apr1$r31.....$HqJZimcKQFAMYayBlzkrA/'

describe('validateHtpasswd', () => {
	it('valida un hash APR1 correcto', async () => {
		expect(await validateHtpasswd('user', 'myPassword', APR1)).toBe(true)
	})

	it('rechaza contraseña incorrecta con APR1', async () => {
		expect(await validateHtpasswd('user', 'wrong', APR1)).toBe(false)
	})

	it('valida bcrypt con contraseña correcta', async () => {
		const hash = await bcrypt.hash('secret', 4)
		expect(await validateHtpasswd('user', 'secret', `user:${hash}`)).toBe(true)
	})

	it('rechaza hash con escapes `\\$` (formato incorrecto)', async () => {
		const escaped = APR1.replace(/\$/g, '\\$')
		expect(await validateHtpasswd('user', 'myPassword', escaped)).toBe(false)
	})

	it('rechaza hash con `$$` sin interpolar y texto plano (fail-closed)', async () => {
		const doubled = APR1.replace(/\$/g, '$$$$')
		expect(await validateHtpasswd('user', 'myPassword', doubled)).toBe(false)
		expect(await validateHtpasswd('user', 'plain', 'user:plain')).toBe(false)
	})
})
