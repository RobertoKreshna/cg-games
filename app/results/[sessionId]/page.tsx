'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLeaderboard } from '@/lib/api'
import { clearPlayerSession, getCurrentPlayerRoom } from '@/lib/tokens'
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
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col p-6">
      <div className="mb-6">
        <p className="tag mb-1">Hasil Akhir</p>
        <h1 className="text-3xl font-bold text-[#111] tracking-tight">Leaderboard</h1>
      </div>

      <div className="flex-1">
        {loading ? (
          <p className="text-[#CCC] text-sm text-center py-12">Memuat...</p>
        ) : entries.length === 0 ? (
          <p className="text-[#CCC] text-sm text-center py-12">Belum ada data.</p>
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
        className="btn-secondary py-4 text-base w-full mt-6"
      >
        ← Kembali ke Home
      </button>
    </main>
  )
}
