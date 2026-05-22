'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLeaderboard } from '@/lib/api'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { LeaderboardEntry, RoomMode } from '@/types/game'

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [mode, setMode] = useState<RoomMode>('individual')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLeaderboard(sessionId)
      .then((data: { leaderboard: LeaderboardEntry[]; mode: RoomMode }) => {
        setEntries(data.leaderboard)
        setMode(data.mode)
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <main className="app-bg grid-bg min-h-screen flex flex-col p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full bg-amber-500/12 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col pt-6">
        <div className="mb-6">
          <p className="label-tag mb-1">Hasil Akhir</p>
          <h1 className="heading text-3xl text-white">🏆 Leaderboard</h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/35 text-sm animate-pulse">Memuat...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/35 text-sm">Belum ada data.</p>
          </div>
        ) : (
          <Leaderboard entries={entries} mode={mode} />
        )}
      </div>

      <button
        onClick={() => router.push('/')}
        className="btn-glass py-4 w-full mt-6 relative z-10"
      >
        ← Kembali ke Home
      </button>
    </main>
  )
}
