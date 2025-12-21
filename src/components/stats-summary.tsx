import { ArrowUp, Check, HelpCircle } from 'lucide-react'

interface StatsSummaryProps {
	updatedCount: number
	availableCount: number
	unknownCount: number
}

export function StatsSummary({
	updatedCount,
	availableCount,
	unknownCount
}: StatsSummaryProps) {
	return (
		<div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
			{/* Updated Card */}
			<div className='bg-neutral-900/40 rounded-lg p-3 border border-neutral-800/60 flex items-center gap-3 transition-colors hover:bg-neutral-900/60'>
				<div className='bg-green-950/30 text-green-500 p-2 rounded-md border border-green-500/20'>
					<Check className='h-4 w-4' strokeWidth={3} />
				</div>
				<span className='font-semibold text-neutral-200 text-sm'>
					{updatedCount} {updatedCount === 1 ? 'Imagen actualizada' : 'Imágenes actualizadas'}
				</span>
			</div>

			{/* Available Card with Gradient */}
			<div className='bg-neutral-900/40 rounded-lg p-3 border border-neutral-800/60 flex items-center gap-3 relative overflow-hidden transition-colors hover:bg-neutral-900/60 group'>
				<div className='absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-amber-500/5 to-transparent opacity-60 pointer-events-none' />
				<div className='bg-amber-950/40 text-amber-500 p-2 rounded-md border border-amber-500/20 relative z-10'>
					<ArrowUp className='h-4 w-4' strokeWidth={3} />
				</div>
				<span className='font-semibold text-amber-100/90 text-sm relative z-10 group-hover:text-amber-100 transition-colors'>
					{availableCount} {availableCount === 1 ? 'Actualización disponible' : 'Actualizaciones disponibles'}
				</span>
			</div>

			{/* Unknown Card */}
			<div className='bg-neutral-900/40 rounded-lg p-3 border border-neutral-800/60 flex items-center gap-3 transition-colors hover:bg-neutral-900/60'>
				<div className='bg-neutral-800 text-neutral-400 p-2 rounded-md border border-neutral-700/50'>
					<HelpCircle className='h-4 w-4' strokeWidth={3} />
				</div>
				<span className='font-semibold text-neutral-300 text-sm'>
					{unknownCount} {unknownCount === 1 ? 'Imagen desconocida' : 'Imágenes desconocidas'}
				</span>
			</div>
		</div>
	)
}
