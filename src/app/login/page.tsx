import { Suspense } from 'react'
import { LoginGate } from '@/components/login-gate'

// Static shell: no cookies/headers/runtime APIs here. Auth + locale live in
// LoginGate (inside Suspense); the proxy remains the primary auth barrier.
export default function LoginPage() {
	return (
		<Suspense fallback={null}>
			<LoginGate />
		</Suspense>
	)
}
