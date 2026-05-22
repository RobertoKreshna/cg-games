'use client'
import { useEffect, useState } from 'react'

interface TimerProps {
  durationMs: number
  onExpire: () => void
  className?: string
}

export function Timer({ durationMs, onExpire, className = '' }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs)

  useEffect(() => {
    setRemainingMs(durationMs)
    const start = Date.now()
    const interval = setInterval(() => {
      const remaining = Math.max(0, durationMs - (Date.now() - start))
      setRemainingMs(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onExpire()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [durationMs, onExpire])

  const pct = remainingMs / durationMs
  const seconds = Math.ceil(remainingMs / 1000)
  const circumference = 2 * Math.PI * 28
  const color = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#eab308' : '#ef4444'

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#ffffff30" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            className="transition-all duration-100"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-bold text-xl text-white">
          {seconds}
        </span>
      </div>
    </div>
  )
}
