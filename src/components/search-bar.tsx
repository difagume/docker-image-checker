'use client'

import NumberFlow from '@number-flow/react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchBarProps {
	searchQuery: string
	debouncedQuery: string
	onSearchChange: (value: string) => void
	onClear: () => void
	filteredCount: number
	totalCount: number
	dict: {
		showing: string
		clearFilter: string
		placeholder: string
		placeholderMobile: string
	}
}

export function SearchBar({
	searchQuery,
	debouncedQuery,
	onSearchChange,
	onClear,
	filteredCount,
	totalCount,
	dict
}: SearchBarProps) {
	return (
		<div className='flex flex-col md:flex-row gap-4 items-center justify-between mb-8 md:mb-6'>
			<div className='relative w-full shadow-sm'>
				<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' aria-hidden='true' />
				{/* Mobile input */}
				<Input
					placeholder={dict.placeholderMobile}
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					maxLength={70}
					className='rounded-sm pl-10 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring h-11 md:h-10 transition-colors hover:border-border md:hidden'
				/>
				{/* Desktop input */}
				<Input
					placeholder={dict.placeholder}
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					maxLength={70}
					className='rounded-sm pl-10 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring h-11 md:h-10 transition-colors hover:border-border hidden md:block'
				/>
				{debouncedQuery && (
					<span className='absolute right-9 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium hidden md:block pointer-events-none'>
						{dict.showing.split('{count}')[0]}
						<NumberFlow value={filteredCount} />
						{dict.showing.split('{count}')[1].split('{total}')[0]}
						<NumberFlow value={totalCount} />
						{dict.showing.split('{total}')[1]}
					</span>
				)}
				{searchQuery && (
					<button
						type='button'
						onClick={onClear}
						className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted'
						aria-label={dict.clearFilter}
					>
						<X className='h-4 w-4' aria-hidden='true' />
					</button>
				)}
			</div>

			{debouncedQuery && (
				<div className='w-full md:hidden text-center'>
					<span className='text-sm text-muted-foreground font-medium'>
						{dict.showing.split('{count}')[0]}
						<NumberFlow value={filteredCount} />
						{dict.showing.split('{count}')[1].split('{total}')[0]}
						<NumberFlow value={totalCount} />
						{dict.showing.split('{total}')[1]}
					</span>
				</div>
			)}
		</div>
	)
}
