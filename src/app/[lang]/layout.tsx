import type { Metadata, Viewport } from 'next'
import { getDictionary, type Locale } from '@/lib/i18n'
import { LangAttribute } from '@/components/lang-attribute'

export const viewport: Viewport = {
	themeColor: '#09090b'
}

export async function generateMetadata({
	params
}: {
	params: Promise<{ lang: Locale }>
}): Promise<Metadata> {
	const { lang } = await params
	const dict = getDictionary(lang)

	return {
		title: 'Docker Image Checker',
		description: dict.dashboard.description,
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
}

export default async function LangLayout({
	children,
	params
}: Readonly<{
	children: React.ReactNode
	params: Promise<{ lang: Locale }>
}>) {
	const { lang } = await params

	return (
		<>
			<LangAttribute lang={lang} />
			{children}
		</>
	)
}

