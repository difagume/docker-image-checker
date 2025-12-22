import { IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const ibmPlexMono = IBM_Plex_Mono({
	variable: '--font-ibm-plex-mono',
	subsets: ['latin'],
	weight: ['100', '200', '300', '400', '500', '600', '700']
})

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html suppressHydrationWarning>
			<body className={`${ibmPlexMono.variable} font-sans antialiased`}>
				{children}
			</body>
		</html>
	)
}
