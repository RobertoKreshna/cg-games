import type { Metadata, Viewport } from 'next'
import { Fredoka, Nunito } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fredoka',
  weight: ['400', '500', '600', '700'],
})

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '600', '700', '800'],
})

const DESCRIPTION = 'Game kuis multiplayer untuk connect group'

export const metadata: Metadata = {
  title: 'CG Games',
  description: DESCRIPTION,
  openGraph: { title: 'CG Games', description: DESCRIPTION, locale: 'id_ID', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'CG Games', description: DESCRIPTION },
  appleWebApp: { title: 'CG Games', capable: true },
}

export const viewport: Viewport = {
  themeColor: '#0B1F4B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
