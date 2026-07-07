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

export const metadata: Metadata = {
  title: 'CG Games',
  description: 'Game seru buat connect group',
}

export const viewport: Viewport = {
  themeColor: '#1E1B4B',
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
