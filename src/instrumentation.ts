export async function register() {
	console.log(`
██████╗  ██████╗  ██████╗██╗  ██╗███████╗██████╗     ██╗███╗   ███╗ █████╗  ██████╗ ███████╗     ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗███████╗██████╗ 
██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗    ██║████╗ ████║██╔══██╗██╔════╝ ██╔════╝    ██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝██╔════╝██╔══██╗
██║  ██║██║   ██║██║     █████╔╝ █████╗  ██████╔╝    ██║██╔████╔██║███████║██║  ███╗█████╗      ██║     ███████║█████╗  ██║     █████╔╝ █████╗  ██████╔╝
██║  ██║██║   ██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗    ██║██║╚██╔╝██║██╔══██║██║   ██║██╔══╝      ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗ ██╔══╝  ██╔══██╗
██████╔╝╚██████╔╝╚██████╗██║  ██╗███████╗██║  ██║    ██║██║ ╚═╝ ██║██║  ██║╚██████╔╝███████╗    ╚██████╗██║  ██║███████╗╚██████╗██║  ██╗███████╗██║  ██║
╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝     ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`)

	// Los efectos secundarios deben vivir dentro de register(): se ejecuta una
	// sola vez al iniciar el servidor, no al importar el módulo.
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { initScheduler } = await import('./lib/notifications/scheduler')
		initScheduler()

		// Inbound long-polling bot for one-tap Telegram image updates. Runs
		// beside the scheduler; env-gated + globalThis singleton (R4.1/R4.2).
		const { initTelegramPolling, stopTelegramPolling } = await import(
			'./lib/notifications/telegram-polling'
		)
		initTelegramPolling()

		// Graceful stop on SIGTERM/SIGINT so getUpdates loops end cleanly (R15).
		const handleShutdown = async (signal: string) => {
			console.log(
				`[instrumentation] ${signal} received, stopping Telegram polling`
			)
			stopTelegramPolling()
		}
		process.once('SIGTERM', () => void handleShutdown('SIGTERM'))
		process.once('SIGINT', () => void handleShutdown('SIGINT'))
	}
}
