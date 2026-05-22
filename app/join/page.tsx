'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinRoom } from '@/lib/api'
import { savePlayerSession } from '@/lib/tokens'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (!code.trim() || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await joinRoom(code.toUpperCase().trim(), name.trim())
      savePlayerSession(code.toUpperCase().trim(), {
        sessionToken: data.session_token,
        playerId: data.player_id,
        gameType: data.room.game_type,
        mode: data.room.mode,
      })
      router.push(`/play/${code.toUpperCase().trim()}`)
    } catch {
      setError('Room tidak ditemukan atau game sudah mulai.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-bg grid-bg min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full bg-violet-700/18 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        <button
          onClick={() => router.back()}
          className="text-white/35 text-sm mb-7 flex items-center gap-1.5 hover:text-white/60 transition-colors"
        >
          ← Kembali
        </button>

        <h1 className="heading text-4xl text-white mb-1">Gabung Room</h1>
        <p className="text-white/35 text-sm mb-8">Masukkan kode dari host</p>

        <div className="glass-card p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="label-tag">Kode Room</label>
            <input
              className="dark-input p-4 text-center text-3xl font-black tracking-[0.28em] uppercase w-full"
              placeholder="· · · · · ·"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label-tag">Nama Kamu</label>
            <input
              className="dark-input p-4 text-center text-lg font-semibold w-full"
              placeholder="Nama..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          {error && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || !code.trim() || !name.trim()}
            className="btn-primary py-4 text-lg w-full mt-1"
          >
            {loading ? 'Joining...' : 'Masuk →'}
          </button>
        </div>
      </div>
    </main>
  )
}
