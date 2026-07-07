'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinRoom } from '@/lib/api'
import { savePlayerSession, setCurrentPlayerRoom } from '@/lib/tokens'

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
      const roomCode = code.toUpperCase().trim()
      savePlayerSession(roomCode, {
        sessionToken: data.session_token,
        playerId: data.player_id,
        gameType: data.room.game_type,
        mode: data.room.mode,
      })
      setCurrentPlayerRoom(roomCode)
      router.push(`/play/${roomCode}`)
    } catch {
      setError('Room tidak ditemukan atau game sudah mulai.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button onClick={() => router.back()} className="text-mist text-sm font-bold mb-8 flex items-center gap-1 cursor-pointer">
          ← Kembali
        </button>

        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Gabung Room</h1>
        <p className="text-mist text-sm font-semibold mb-8">Masukkan kode dari host</p>

        <div className="card p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="tag">Kode Room</label>
            <input
              className="field-input font-display p-4 text-center text-3xl font-semibold tracking-[0.25em] uppercase w-full text-gold"
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="tag">Nama Kamu</label>
            <input
              className="field-input p-4 text-center text-base font-semibold w-full"
              placeholder="Nama..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          {error && (
            <p className="text-rose-300 text-sm font-semibold text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || !code.trim() || !name.trim()}
            className="btn-primary py-4 text-base w-full"
          >
            {loading ? 'Joining...' : 'Masuk 🚀'}
          </button>
        </div>
      </div>
    </main>
  )
}
