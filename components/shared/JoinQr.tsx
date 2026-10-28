'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { joinLink } from '@/lib/room-code'

const subscribeNoop = () => () => {}

export function JoinQr({ roomCode }: { roomCode: string }) {
  // The origin is only known in the browser; '' on the server keeps hydration consistent.
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => '')
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!origin) return null
  const link = joinLink(origin, roomCode)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the link is still shown for typing or sharing by hand.
    }
  }

  return (
    <div className="card p-3 mb-4 flex items-center gap-4">
      <div className="bg-white rounded-xl p-2 shrink-0">
        <QRCodeSVG
          value={link}
          size={104}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#0B1F4B"
          title={`QR code untuk bergabung ke room ${roomCode}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="tag mb-1">Gabung cepat</p>
        <p className="text-xs font-semibold text-mist mb-2">Scan dengan kamera HP, atau buka link:</p>
        <p className="text-[11px] font-bold text-faint truncate mb-2">{link.replace(/^https?:\/\//, '')}</p>
        <button onClick={copy} className="btn-secondary py-1.5 px-3 text-xs">
          {copied ? '✓ Tersalin' : 'Salin link'}
        </button>
      </div>
    </div>
  )
}
