'use client'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/report'

// Only rendered when the root layout itself fails, so it cannot rely on the app's styles.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    reportClientError('app/global-error', error)
  }, [error])

  return (
    <html lang="id">
      <body style={{ background: '#0b1f4b', color: '#fff', fontFamily: 'sans-serif', display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 20, fontWeight: 600 }}>Ada yang salah</p>
          <button onClick={() => unstable_retry()} style={{ marginTop: 16, padding: '12px 24px', borderRadius: 12, border: 0, background: '#ff9f1c', color: '#0b1f4b', fontWeight: 700 }}>
            Coba lagi
          </button>
        </div>
      </body>
    </html>
  )
}
