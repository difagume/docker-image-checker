'use client'

import { Activity, ArrowDown, ArrowUp, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SortBy, SortDir } from '@/types/app-state'

export type { SortBy, SortDir }

interface SortControlProps {
	sortBy: SortBy
	onSortByChange: (value: SortBy) => void
	sortDir: SortDir
	onSortDirChange: (value: SortDir) => void
}

export function SortControl({
	sortBy,
	onSortByChange,
	sortDir,
	onSortDirChange
}: SortControlProps) {
	const handleToggleDir = () => {
		onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')
	}

	return (
		<div className='flex w-full items-center gap-2 md:w-auto'>
			{/* Mobile: Select full-width — md:hidden */}
			<div className='flex flex-1 md:hidden'>
				<Select
					value={sortBy}
					onValueChange={(v) => onSortByChange(v as SortBy)}
				>
					<SelectTrigger
						size='default'
						className='w-full flex-1 rounded-md'
						aria-label='Ordenar por'
					>
						<SelectValue placeholder='Ordenar' />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value='name'>Nombre</SelectItem>
							<SelectItem value='status'>Estado</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{/* Desktop: ToggleGroup single outline default (h-8 / 32px) — hidden md:flex */}
			<ToggleGroup
				type='single'
				variant='outline'
				size='default'
				value={sortBy}
				onValueChange={(v) => {
					if (v) onSortByChange(v as SortBy)
				}}
				className='hidden md:flex rounded-md'
				aria-label='Ordenar por'
			>
				<ToggleGroupItem
					value='name'
					aria-label='Ordenar por nombre'
					className='rounded-md'
				>
					<Type data-icon='inline-start' />
					Nombre
				</ToggleGroupItem>
				<ToggleGroupItem
					value='status'
					aria-label='Ordenar por estado'
					className='rounded-md'
				>
					<Activity data-icon='inline-start' />
					Estado
				</ToggleGroupItem>
			</ToggleGroup>

			<Button
				variant='outline'
				size='icon-sm'
				className='shrink-0 rounded-md'
				onClick={handleToggleDir}
				aria-label={
					sortDir === 'asc'
						? 'Orden ascendente, cambiar a descendente'
						: 'Orden descendente, cambiar a ascendente'
				}
				title={sortDir === 'asc' ? 'Ascendente (A-Z)' : 'Descendente (Z-A)'}
			>
				{sortDir === 'asc' ? (
					<ArrowUp data-icon='inline-start' />
				) : (
					<ArrowDown data-icon='inline-start' />
				)}
			</Button>
		</div>
	)
}
