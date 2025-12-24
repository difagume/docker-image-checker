'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { login } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { Dictionary } from '@/lib/i18n/dictionaries'

interface LoginFormProps {
	dict: Dictionary['login']
}

export default function LoginForm({ dict }: LoginFormProps) {
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(false)
	const router = useRouter()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setLoading(true)
		setError('')

		try {
			const result = await login(username, password)

			if (result.success) {
				router.push('/')
				router.refresh()
			} else {
				// Si el error es una clave de diccionario, usamos el valor del diccionario, de lo contrario mostramos el mensaje directamente
				const errorMessage =
					result.error === 'invalidCredentials'
						? dict.invalidCredentials
						: result.error || dict.errorOccurred
				setError(errorMessage)
			}
		} catch (err) {
			setError(dict.errorOccurred)
			console.error(err)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className='min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-4'>
			<Card className='w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[3.5px] shadow-lg'>
				<CardHeader className='text-center space-y-2'>
					<CardTitle className='text-2xl font-semibold tracking-tight text-white'>
						{dict.title}
					</CardTitle>
					<CardDescription className='text-sm text-neutral-400'>
						{dict.description}
					</CardDescription>
					<div className='h-px bg-neutral-800 mt-2' />
				</CardHeader>

				<CardContent>
					<form onSubmit={handleSubmit} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='username' className='text-sm text-neutral-300'>
								{dict.username}
							</Label>
							<Input
								autoFocus
								id='username'
								type='text'
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder={dict.usernamePlaceholder}
								required
								className='bg-neutral-800 border-neutral-700 text-white rounded-[3.5px] placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-0'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='password' className='text-sm text-neutral-300'>
								{dict.password}
							</Label>
							<Input
								id='password'
								type='password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder={dict.passwordPlaceholder}
								required
								className='bg-neutral-800 border-neutral-700 text-white rounded-[3.5px] placeholder:text-neutral-500 focus:border-neutral-500 focus:ring-0'
							/>
						</div>

						{error && (
							<div className='h-9 flex items-center rounded-[3.5px] border border-red-800 bg-red-950/40 px-3 text-sm leading-none text-red-400'>
								{error}
							</div>
						)}

						<Button
							type='submit'
							disabled={loading}
							className='w-full bg-green-900/40 hover:bg-green-900/60 text-green-200 border border-green-800 rounded-[3.5px] flex items-center justify-center gap-2 transition-colors'
						>
							{loading ? (
								<>
									<Spinner className='h-4 w-4' />
									<span>{dict.signingIn}</span>
								</>
							) : (
								dict.signIn
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
