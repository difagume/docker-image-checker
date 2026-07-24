'use client'

import { LogOut } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface LogoutButtonProps
	extends Omit<React.ComponentProps<typeof Button>, 'aria-label'> {
	ariaLabel?: string
	showIcon?: boolean
}

export function LogoutButton({
	className,
	children,
	ariaLabel,
	showIcon,
	...props
}: LogoutButtonProps) {
	const { pending } = useFormStatus()

	return (
		<Button
			type='submit'
			disabled={pending}
			aria-busy={pending}
			aria-label={
				ariaLabel ? (pending ? `${ariaLabel} — pending` : ariaLabel) : undefined
			}
			className={cn(
				'rounded-sm hover:bg-neutral-700! hover:text-neutral-950! hover:border-neutral-700! items-center gap-2',
				className
			)}
			{...props}
		>
			{showIcon ? (
				<>
					{pending ? (
						<Spinner className='h-4 w-4' />
					) : (
						<LogOut className='h-4 w-4' />
					)}
					{children}
				</>
			) : (
				children
			)}
		</Button>
	)
}
