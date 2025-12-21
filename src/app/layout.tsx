import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const ibmPlexMono = IBM_Plex_Mono({
	variable: '--font-ibm-plex-mono',
	subsets: ['latin'],
	weight: ['100', '200', '300', '400', '500', '600', '700']
})

export const metadata: Metadata = {
	title: 'Docker Image Checker',
	description: 'Docker Image Checker dashboard',
	icons: {
		icon: [
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon.ico' }
		],
		apple: [
			{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
		]
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
		<html lang='en'>
			<body className={`${ibmPlexMono.variable} font-sans antialiased`}>
				{children}
			</body>
		</html>
	)
}
