import type { ScheduledTask } from 'node-cron'
import cron from 'node-cron'
import { getContainers, getImages } from '@/actions/docker'
import { checkAndNotify } from './notification-service'
import { validateProviders } from './provider-factory'

let scheduledTask: ScheduledTask | null = null

/**
 * Initialize the notification scheduler
 */
export function initScheduler(): void {
	if (scheduledTask) {
		console.log('Notification scheduler already initialized')
		return
	}

	const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'

	if (!enabled) {
		console.log('Notifications are disabled (NOTIFICATIONS_ENABLED=false)')
		return
	}

	// Validate providers
	const validation = validateProviders()
	if (!validation.valid) {
		console.error('Notification provider validation failed:')
		for (const error of validation.errors) {
			console.error(`  - ${error}`)
		}
		return
	}

	const schedule = process.env.NOTIFICATIONS_CRON_SCHEDULE || '0 */6 * * *'

	// Validate cron expression
	if (!cron.validate(schedule)) {
		console.error(`Invalid cron expression: ${schedule}`)
		return
	}

	console.log(`Initializing notification scheduler with schedule: ${schedule}`)

	// Schedule the task
	scheduledTask = cron.schedule(
		schedule,
		async () => {
			console.log('Running scheduled notification check...')
			try {
				const containers = await getContainers()
				const images = await getImages()
				await checkAndNotify(containers, images)
			} catch (error) {
				console.error('Error during scheduled notification check:', error)
			}
		},
		{
			timezone: process.env.TZ
		}
	)

	console.log('Notification scheduler initialized successfully')

	// Run an initial check after a short delay (30 seconds)
	// This helps verify the setup is working without waiting for the first cron execution
	setTimeout(async () => {
		console.log('Running initial notification check...')
		try {
			const containers = await getContainers()
			const images = await getImages()
			await checkAndNotify(containers, images)
		} catch (error) {
			console.error('Error during initial notification check:', error)
		}
	}, 30000)
}

/**
 * Stop the notification scheduler
 */
export function stopScheduler(): void {
	if (scheduledTask) {
		scheduledTask.stop()
		scheduledTask = null
		console.log('Notification scheduler stopped')
	}
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
	enabled: boolean
	schedule?: string
	running: boolean
} {
	const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'
	const schedule = process.env.NOTIFICATIONS_CRON_SCHEDULE || '0 */6 * * *'

	return {
		enabled,
		schedule: enabled ? schedule : undefined,
		running: scheduledTask !== null
	}
}
