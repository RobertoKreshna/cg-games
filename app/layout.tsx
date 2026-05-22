import type { Metadata } from 'next'
import { Syne, Nunito } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700', '800'],
})

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'CG Games',
  description: 'Game seru buat connect group',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${syne.variable} ${nunito.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
