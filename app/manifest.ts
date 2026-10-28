import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CG Games',
    short_name: 'CG Games',
    description: 'Game kuis multiplayer untuk connect group',
    start_url: '/',
    display: 'standalone',
    background_color: '#1E1B4B',
    theme_color: '#1E1B4B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
