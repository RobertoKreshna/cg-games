'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLeaderboard } from '@/lib/api'
import { clearPlayerSession, getCurrentPlayerRoom, getPlayerSession } from '@/lib/tokens'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { LeaderboardEntry, RoomMode } from '@/types/game'

const CONFETTI_COLORS = ['#FF6B81', '#38BDF8', '#FFD43B', '#4ADE80', '#FF9F1C', '#93C5FD']
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
  const [me, setMe] = useState<{ playerId: string; teamId: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // The player's token lets the server say which row is theirs (hosts have none).
    const code = getCurrentPlayerRoom()
    const token = code ? getPlayerSession(code)?.sessionToken : undefined
    getLeaderboard(sessionId, token)
      .then((data: { leaderboard: LeaderboardEntry[]; mode: RoomMode; me: { playerId: string; teamId: string | null } | null }) => {
        setEntries(data.leaderboard)
        setMode(data.mode)
        setMe(data.me)
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [sessionId, attempt])

  const meId = me ? (mode === 'team' ? me.teamId : me.playerId) : null
  // With a long list (30 players) your own row can be far down: bring it into view.
  useEffect(() => {
    if (loading || !meId) return
    const row = document.querySelector('[data-me="true"]')
    if (!row) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [loading, meId, entries])

  const myRank = meId ? entries.findIndex((e) => (e.playerId ?? e.teamId) === meId) : -1

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
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-rose-300 text-sm font-semibold text-center">Gagal memuat hasil.</p>
            <button onClick={() => { setLoading(true); setAttempt((n) => n + 1) }} className="btn-secondary py-3 px-6 text-sm">
              Coba lagi
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-faint text-sm font-semibold text-center py-12">Belum ada data.</p>
        ) : (
          <>
            {myRank >= 0 && (
              <p className="text-center text-sm font-bold mb-4" role="status">
                Posisimu: <span className="text-accent">#{myRank + 1}</span> dari {entries.length}
                {mode === 'team' && <span className="text-mist"> (tim)</span>}
              </p>
            )}
            <Leaderboard entries={entries} mode={mode} meId={meId} />
            {mode === 'team' && (
              <p className="text-faint text-xs font-semibold text-center mt-4">
                Skor tim = rata-rata poin per anggota.
              </p>
            )}
          </>
        )}
      </div>

      {/* Stays reachable however long the list is. */}
      <div className="sticky bottom-0 z-10 -mx-6 px-6 pt-6 pb-6 mt-auto bg-gradient-to-t from-night from-60% to-transparent">
        <button
          onClick={() => {
            const code = getCurrentPlayerRoom()
            if (code) clearPlayerSession(code)
            router.push('/')
          }}
          className="btn-secondary py-4 text-base w-full"
        >
          ← Kembali ke Home
        </button>
      </div>
    </main>
  )
}
