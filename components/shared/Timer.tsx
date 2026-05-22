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
  const circumference = 2 * Math.PI * 26
  const color = pct > 0.45 ? '#111111' : pct > 0.2 ? '#F59E0B' : '#EF4444'

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill="none" stroke="#E8E8E8" strokeWidth="4" />
          <circle
            cx="30" cy="30" r="26" fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            strokeLinecap="round"
            className="transition-all duration-100"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-bold text-lg text-[#111]">
          {seconds}
        </span>
      </div>
    </div>
  )
}
