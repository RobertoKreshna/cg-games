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
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button onClick={() => router.back()} className="text-[#999] text-sm mb-8 flex items-center gap-1">
          ← Kembali
        </button>

        <h1 className="text-3xl font-bold text-[#111] tracking-tight mb-1">Gabung Room</h1>
        <p className="text-[#999] text-sm mb-8">Masukkan kode dari host</p>

        <div className="card p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="tag">Kode Room</label>
            <input
              className="field-input p-4 text-center text-3xl font-bold tracking-[0.25em] uppercase w-full"
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="tag">Nama Kamu</label>
            <input
              className="field-input p-4 text-center text-base font-medium w-full"
              placeholder="Nama..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || !code.trim() || !name.trim()}
            className="btn-primary py-4 text-base w-full"
          >
            {loading ? 'Joining...' : 'Masuk'}
          </button>
        </div>
      </div>
    </main>
  )
}
