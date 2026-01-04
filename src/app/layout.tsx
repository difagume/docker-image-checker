import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Footer } from '@/components/footer'

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

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en' suppressHydrationWarning>
			<body
				className={`${ibmPlexMono.variable} font-sans antialiased min-h-dvh flex flex-col bg-neutral-950 text-neutral-50`}
			>
				{children}
				<Footer />
			</body>
		</html>
	)
}
