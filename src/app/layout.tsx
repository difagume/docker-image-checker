import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/footer'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getLocale } from '@/lib/i18n/get-locale'

const ibmPlexMono = IBM_Plex_Mono({
	variable: '--font-ibm-plex-mono',
	subsets: ['latin'],
	weight: ['100', '200', '300', '400', '500', '600', '700']
})

export const metadata: Metadata = {
	title: 'Docker Image Checker',
	description:
		'Self-hosted dashboard to monitor Docker containers and detect available image updates.',

	icons: {
		icon: [
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon.ico' },
			{ url: '/icon.svg', type: 'image/svg+xml' }
		],
		apple: [
			{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
		]
	},

	openGraph: {
		title: 'Docker Image Checker',
		description:
			'Self-hosted dashboard to monitor Docker containers and detect available image updates.',
		type: 'website'
	},

	twitter: {
		card: 'summary',
		title: 'Docker Image Checker',
		description:
			'Self-hosted dashboard to monitor Docker containers and detect available image updates.'
	},

	manifest: '/site.webmanifest'
}

export const viewport: Viewport = {
	themeColor: '#09090b'
}

export default async function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	const locale = await getLocale()

	return (
		<html lang={locale} suppressHydrationWarning>
			<body
				className={`${ibmPlexMono.variable} font-sans antialiased min-h-dvh flex flex-col`}
			>
				<a
					href='#main-content'
					className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:rounded-sm'
				>
					Skip to main content
				</a>
				<ThemeProvider
					attribute='class'
					defaultTheme='dark'
					enableSystem={false}
					disableTransitionOnChange
				>
					<TooltipProvider>
						<main id='main-content' className='flex-1 flex flex-col'>
							{children}
						</main>
						<Footer />
						<Toaster richColors />
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	)
}
