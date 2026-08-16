import type { ScheduledTask } from 'node-cron'
import cron from 'node-cron'
import { clearOldNotifications } from '@/lib/app-state'
import { listContainersRaw, listImagesRaw } from '@/lib/docker-inventory'
import { checkAndNotify } from './notification-service'
import { validateProviders } from './provider-factory'

// globalThis guard: in dev, module reinstantiation would otherwise create a
// second cron task alongside the existing one.
const schedulerStore = globalThis as unknown as {
	__schedulerTask?: ScheduledTask | null
	__schedulerInitialCheck?: NodeJS.Timeout | null
}

/**
 * Run one notification check (containers + images + notify), then prune
 * notified updates older than 30 days so the state file does not grow
 * unboundedly.
 */
async function runNotificationCheck(): Promise<void> {
	const containers = await listContainersRaw()
	const images = await listImagesRaw()
	await checkAndNotify(containers, images)
	try {
		await clearOldNotifications(30)
	} catch (error) {
		console.error('Error pruning old notifications:', error)
	}
}

/**
 * Initialize the notification scheduler
 */
export function initScheduler(): void {
	if (schedulerStore.__schedulerTask) {
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
	schedulerStore.__schedulerTask = cron.schedule(
		schedule,
		async () => {
			console.log('Running scheduled notification check...')
			try {
				await runNotificationCheck()
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
	schedulerStore.__schedulerInitialCheck = setTimeout(async () => {
		schedulerStore.__schedulerInitialCheck = null
		console.log('Running initial notification check...')
		try {
			await runNotificationCheck()
		} catch (error) {
			console.error('Error during initial notification check:', error)
		}
	}, 30000)
}

/**
 * Stop the notification scheduler
 */
export function stopScheduler(): void {
	if (schedulerStore.__schedulerInitialCheck) {
		clearTimeout(schedulerStore.__schedulerInitialCheck)
		schedulerStore.__schedulerInitialCheck = null
	}
	if (schedulerStore.__schedulerTask) {
		schedulerStore.__schedulerTask.stop()
		schedulerStore.__schedulerTask = null
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
		running: schedulerStore.__schedulerTask !== null
	}
}
