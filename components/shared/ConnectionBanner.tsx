'use client'
import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '@/lib/realtime'

// Brief drops are normal (the hook reconnects within seconds); only warn if it lasts.
const SHOW_AFTER_MS = 2500

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status !== 'disconnected') {
      const reset = setTimeout(() => setVisible(false), 0)
      return () => clearTimeout(reset)
    }
    const id = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [status])

  if (!visible) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-accent text-night text-center text-xs font-bold py-2 px-4 shadow-[0_2px_0_#b36b00]"
    >
      📡 Koneksi terputus, menyambung ulang…
    </div>
  )
}
