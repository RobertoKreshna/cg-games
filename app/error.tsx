'use client'
import { useEffect } from 'react'
import { reportClientError } from '@/lib/report'

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    reportClientError('app/error', error)
  }, [error])

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full">
        <div className="text-5xl">😵</div>
        <p className="font-display text-xl font-semibold">Ada yang salah</p>
        <p className="text-mist text-sm font-semibold">Coba muat ulang halaman ini.</p>
        <button onClick={() => unstable_retry()} className="btn-primary py-3 text-base w-full">
          Coba lagi
        </button>
      </div>
    </main>
  )
}
