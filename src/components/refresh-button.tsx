'use client'

import { RefreshCcw } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RefreshButton() {
	const { pending } = useFormStatus()

	return (
		<Button
			type='submit'
			variant='outline'
			size='icon'
			disabled={pending}
			className='relative bg-neutral-800 hover:bg-neutral-700 text-white rounded-[3.5px] border-neutral-700 disabled:opacity-80'
		>
			<RefreshCcw
				className={cn('h-4 w-4 transition-all', pending && 'animate-spin')}
			/>
		</Button>
	)
}
