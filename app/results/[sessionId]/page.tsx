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
    <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 p-4 flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-6">🏆 Leaderboard</h1>
      {loading ? (
        <p className="text-white/70 text-center">Loading...</p>
      ) : (
        <Leaderboard entries={entries} mode={mode} />
      )}
      <button
        onClick={() => router.push('/')}
        className="mt-8 bg-white/20 text-white font-semibold py-3 rounded-xl border border-white/30 active:scale-95"
      >
        Kembali ke Home
      </button>
    </main>
  )
}
