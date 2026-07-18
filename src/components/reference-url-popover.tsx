'use client'

import { ExternalLink, Link as LinkIcon, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Popover,
	PopoverContent,
	PopoverTrigger
} from '@/components/ui/popover'
import type { Dictionary } from '@/lib/i18n/dictionaries'

interface ReferenceUrlPopoverProps {
	imageName: string
	currentUrl?: string
	onSave: (url: string) => void
	dict: Dictionary['container']
}

export function ReferenceUrlPopover({
	imageName,
	currentUrl,
	onSave,
	dict
}: ReferenceUrlPopoverProps) {
	const [url, setUrl] = useState(currentUrl || '')
	const [isOpen, setIsOpen] = useState(false)

	const isValidUrl = useMemo(() => {
		try {
			if (!url) return false
			new URL(url)
			return true
		} catch {
			return false
		}
	}, [url])

	useEffect(() => {
		setUrl(currentUrl || '')
	}, [currentUrl])

	const handleSave = () => {
		if (!url.trim()) {
			// If URL is empty, treat as delete
			onSave('')
		} else if (!isValidUrl) {
			// Don't save invalid URLs
			return
		} else {
			onSave(url)
		}
		setIsOpen(false)
	}

	const handleDelete = () => {
		setUrl('')
		onSave('')
		setIsOpen(false)
	}

	const handleOpen = () => {
		if (isValidUrl) {
			window.open(url, '_blank', 'noopener,noreferrer')
		}
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type='button'
					title={currentUrl ? dict.editReference : dict.addReference}
					aria-label={currentUrl ? dict.editReference : dict.addReference}
					className={`transition-colors focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 shrink-0 ml-1 ${
						currentUrl
							? 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20'
							: 'text-muted-foreground hover:text-foreground'
					}`}
				>
					<LinkIcon className='h-3.5 w-3.5' aria-hidden='true' />
				</button>
			</PopoverTrigger>
			<PopoverContent className='w-80 bg-popover border-border text-popover-foreground rounded-[3.5px] shadow-2xl p-4'>
				<div className='grid gap-4'>
					<div className='flex items-start justify-between gap-2'>
						<div className='grid gap-1'>
							<h4 className='font-medium text-sm text-foreground'>
								{dict.referenceUrlTitle}
							</h4>
							<p className='text-xs text-muted-foreground wrap-anywhere'>
								{imageName}
							</p>
						</div>
						{currentUrl && (
							<button
								type='button'
								onClick={handleDelete}
								title={dict.delete}
								aria-label={dict.delete}
								className='text-muted-foreground hover:text-destructive transition-colors p-1 hover:bg-destructive/10 rounded shrink-0'
							>
								<Trash2 className='h-4 w-4' aria-hidden='true' />
							</button>
						)}
					</div>

				<div className='grid gap-3'>
					<label htmlFor='url' className='sr-only'>
						{dict.referenceUrlPlaceholder}
					</label>
					<Input
						id='url'
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder={dict.referenceUrlPlaceholder}
						className='h-9 bg-muted border-border text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-[3.5px] text-sm'
					/>

						<div className='flex gap-2'>
							<Button
								size='sm'
								className='flex-1 bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-[3.5px] h-8 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
								disabled={!url.trim()}
								onClick={handleSave}
							>
								{dict.save}
							</Button>
							<Button
								size='sm'
								variant='outline'
								className='flex-1 border-border bg-muted hover:bg-muted/80 text-foreground h-8 gap-1.5 rounded-[3.5px] text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
								disabled={!isValidUrl}
								onClick={handleOpen}
							>
								<ExternalLink className='h-3 w-3' aria-hidden='true' />
								{dict.open}
							</Button>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}
