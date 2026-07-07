'use client'
import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  durationMs: number
  onExpire: () => void
  className?: string
}

export function Timer({ durationMs, onExpire, className = '' }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setRemainingMs(durationMs)
    const start = Date.now()
    const interval = setInterval(() => {
      const remaining = Math.max(0, durationMs - (Date.now() - start))
      setRemainingMs(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onExpireRef.current()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [durationMs])

  const pct = remainingMs / durationMs
  const seconds = Math.ceil(remainingMs / 1000)
  const circumference = 2 * Math.PI * 26
  const color = pct > 0.45 ? '#A3E635' : pct > 0.2 ? '#FBBF24' : '#FB7185'

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`relative w-14 h-14 ${pct <= 0.2 ? 'animate-pulse' : ''}`}>
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
          <circle
            cx="30" cy="30" r="26" fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            strokeLinecap="round"
            className="transition-all duration-100"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display font-semibold text-lg tabular-nums">
          {seconds}
        </span>
      </div>
    </div>
  )
}
