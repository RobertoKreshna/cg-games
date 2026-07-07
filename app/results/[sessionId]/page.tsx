'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLeaderboard } from '@/lib/api'
import { clearPlayerSession, getCurrentPlayerRoom } from '@/lib/tokens'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { LeaderboardEntry, RoomMode } from '@/types/game'

const CONFETTI_COLORS = ['#E11D48', '#2563EB', '#FFC700', '#16A34A', '#7C3AED', '#F0ABFC']
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 137.5) % 100}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: `${-(i * 0.37) % 4}s`,
  duration: `${3 + (i % 3)}s`,
}))

function Confetti() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="absolute -top-6 w-2 h-3 rounded-sm animate-confetti"
          style={{
            left: c.left,
            backgroundColor: c.color,
            animationDelay: c.delay,
            animationDuration: c.duration,
          }}
        />
      ))}
    </div>
  )
}

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [mode, setMode] = useState<RoomMode>('individual')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getLeaderboard(sessionId)
      .then((data: { leaderboard: LeaderboardEntry[]; mode: RoomMode }) => {
        setEntries(data.leaderboard)
        setMode(data.mode)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <main className="min-h-dvh flex flex-col p-6">
      {!loading && !error && entries.length > 0 && <Confetti />}

      <div className="mb-6 text-center">
        <p className="tag mb-1">Hasil Akhir</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          🏆 Leaderboard
        </h1>
      </div>

      <div className="flex-1 relative">
        {loading ? (
          <p className="text-faint text-sm font-semibold text-center py-12 animate-pulse">Memuat...</p>
        ) : error ? (
          <p className="text-rose-300 text-sm font-semibold text-center py-12">Gagal memuat hasil. Coba lagi.</p>
        ) : entries.length === 0 ? (
          <p className="text-faint text-sm font-semibold text-center py-12">Belum ada data.</p>
        ) : (
          <Leaderboard entries={entries} mode={mode} />
        )}
      </div>

      <button
        onClick={() => {
          const code = getCurrentPlayerRoom()
          if (code) clearPlayerSession(code)
          router.push('/')
        }}
        className="btn-secondary py-4 text-base w-full mt-6 relative"
      >
        ← Kembali ke Home
      </button>
    </main>
  )
}
