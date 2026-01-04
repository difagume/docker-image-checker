'use client'

import { Github } from 'lucide-react'

export function Footer() {
	return (
		<footer className='w-full flex justify-end pb-4 pr-4 items-center gap-2'>
			<a
				href='https://github.com/difagume/docker-image-checker'
				target='_blank'
				rel='noopener noreferrer'
				className='text-muted-foreground opacity-60 hover:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95'
				title='View project on GitHub'
			>
				<Github size={20} />
			</a>
		</footer>
	)
}
