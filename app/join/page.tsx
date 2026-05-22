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
    <main className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-600 to-purple-700 p-4">
      <h1 className="text-3xl font-bold text-white mb-8">Gabung Room</h1>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4">
        <input
          className="border-2 border-gray-200 rounded-xl p-3 text-center text-2xl font-bold uppercase tracking-widest focus:border-blue-500 outline-none"
          placeholder="KODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
        />
        <input
          className="border-2 border-gray-200 rounded-xl p-3 text-center text-lg focus:border-blue-500 outline-none"
          placeholder="Nama kamu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={loading || !code.trim() || !name.trim()}
          className="bg-blue-600 text-white font-bold py-3 rounded-xl text-lg disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Joining...' : 'Masuk'}
        </button>
      </div>
    </main>
  )
}
