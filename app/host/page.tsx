'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, assignTeams, startGame, nextQuestion } from '@/lib/api'
import { saveHostSession, updateHostSession } from '@/lib/tokens'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import type { GameType, RoomMode } from '@/types/game'

type HostPhase = 'configure' | 'lobby' | 'playing' | 'finished'

interface PlayerInfo { id: string; name: string; teamName?: string; teamColor?: string }

const GAME_LABELS: Record<GameType, string> = {
  bible_quiz: '📖 Bible Quiz',
  verse_scramble: '📝 Verse Scramble',
  emoji_story: '🎭 Emoji Story',
}

export default function HostPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<HostPhase>('configure')
  const [gameType, setGameType] = useState<GameType>('bible_quiz')
  const [mode, setMode] = useState<RoomMode>('individual')
  const [roomCode, setRoomCode] = useState('')
  const [hostToken, setHostToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [teamCount, setTeamCount] = useState(3)
  const [teamsAssigned, setTeamsAssigned] = useState(false)
  const [questionStatus, setQuestionStatus] = useState<'idle' | 'showing' | 'reveal'>('idle')
  const [currentQ, setCurrentQ] = useState(0)
  const [totalQ, setTotalQ] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.event === 'player_joined') {
      setPlayers((prev) => [...prev, { id: e.payload.player_id, name: e.payload.name }])
    } else if (e.event === 'teams_assigned') {
      const updated: PlayerInfo[] = []
      for (const team of e.payload.teams) {
        for (const member of team.members) {
          updated.push({ id: member.id, name: member.name, teamName: team.name, teamColor: team.color })
        }
      }
      setPlayers(updated)
      setTeamsAssigned(true)
    } else if (e.event === 'question_show') {
      setCurrentQ(e.payload.question_index + 1)
      setTotalQ(e.payload.total_questions)
      setQuestionStatus('showing')
    } else if (e.event === 'question_reveal') {
      setQuestionStatus('reveal')
    } else if (e.event === 'game_finished') {
      setPhase('finished')
    }
  }, [])

  useGameChannel(roomCode || null, handleEvent)

  async function handleCreate() {
    setLoading(true)
    try {
      const data = await createRoom(gameType, mode)
      setRoomCode(data.code)
      setHostToken(data.host_token)
      saveHostSession(data.code, { hostToken: data.host_token, roomId: data.room_id })
      setPhase('lobby')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignTeams() {
    setLoading(true)
    try {
      await assignTeams(roomCode, hostToken, teamCount)
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    setLoading(true)
    try {
      const data = await startGame(roomCode, hostToken)
      setSessionId(data.session_id)
      updateHostSession(roomCode, { sessionId: data.session_id })
      setPhase('playing')
    } finally {
      setLoading(false)
    }
  }

  async function handleNext() {
    if (!sessionId) return
    setLoading(true)
    try {
      await nextQuestion(sessionId, hostToken)
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'configure') {
    return (
      <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-white mb-8">Buat Room</h1>
        <div className="flex flex-col gap-6 max-w-sm">
          <div>
            <p className="text-white/70 text-sm mb-2">Pilih Game</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(GAME_LABELS) as GameType[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGameType(g)}
                  className={`py-3 px-4 rounded-xl font-semibold text-left transition-all ${gameType === g ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
                >
                  {GAME_LABELS[g]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-white/70 text-sm mb-2">Mode</p>
            <div className="flex gap-3">
              {(['individual', 'team'] as RoomMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${mode === m ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
                >
                  {m === 'individual' ? '👤 Individual' : '👥 Tim'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg disabled:opacity-60 active:scale-95 transition-transform mt-4"
          >
            {loading ? 'Membuat...' : 'Buat Room'}
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'lobby') {
    return (
      <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <div className="mb-2">
          <p className="text-white/60 text-sm">Kode Room</p>
          <h2 className="text-5xl font-black text-white tracking-widest">{roomCode}</h2>
        </div>
        <p className="text-blue-200 text-sm mb-6">{GAME_LABELS[gameType]} · {mode === 'individual' ? 'Individual' : 'Tim'}</p>

        <div className="bg-white/10 rounded-2xl p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
          <p className="text-white/60 text-sm mb-2">{players.length} player bergabung</p>
          <div className="flex flex-col gap-1">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-white">
                {p.teamColor && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.teamColor }} />}
                <span>{p.name}</span>
                {p.teamName && <span className="text-white/50 text-xs">{p.teamName}</span>}
              </div>
            ))}
          </div>
        </div>

        {mode === 'team' && (
          <div className="flex items-center gap-3 mb-4">
            <select
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
              className="bg-white/20 text-white rounded-xl px-3 py-2 outline-none"
            >
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} tim</option>)}
            </select>
            <button
              onClick={handleAssignTeams}
              disabled={loading || players.length === 0}
              className="flex-1 bg-white/20 text-white font-semibold py-2 rounded-xl border border-white/30 disabled:opacity-50 active:scale-95"
            >
              {teamsAssigned ? '🔀 Acak Ulang' : '🎲 Acak Tim'}
            </button>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || players.length === 0 || (mode === 'team' && !teamsAssigned)}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Starting...' : '▶ Mulai Game'}
        </button>
        {mode === 'team' && !teamsAssigned && players.length > 0 && (
          <p className="text-yellow-300 text-sm text-center mt-2">Acak tim dulu sebelum mulai</p>
        )}
      </main>
    )
  }

  if (phase === 'playing') {
    return (
      <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-white/60 text-sm">Room {roomCode}</p>
            <p className="text-white font-semibold">{GAME_LABELS[gameType]}</p>
          </div>
          {totalQ > 0 && <p className="text-white/70">Soal {currentQ}/{totalQ}</p>}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {questionStatus === 'idle' && (
            <p className="text-white/70 text-center">Tekan tombol untuk mulai soal pertama</p>
          )}
          {questionStatus === 'showing' && (
            <div className="text-center">
              <div className="text-5xl mb-3 animate-pulse">⏱</div>
              <p className="text-white font-semibold">Player sedang menjawab...</p>
              <p className="text-white/50 text-sm mt-1">{players.length} player</p>
            </div>
          )}
          {questionStatus === 'reveal' && (
            <div className="text-center">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-white font-semibold">Semua sudah menjawab!</p>
            </div>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={loading || questionStatus === 'showing'}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-xl disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? '...' : questionStatus === 'idle' ? '▶ Mulai' : '⏭ Soal Berikutnya'}
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-4">🏆 Game Selesai!</h1>
      <button
        onClick={() => router.push(`/results/${sessionId}`)}
        className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg active:scale-95 mb-4"
      >
        Lihat Leaderboard
      </button>
      <button
        onClick={() => router.push('/')}
        className="bg-white/20 text-white font-semibold py-3 rounded-xl border border-white/30 active:scale-95"
      >
        Kembali ke Home
      </button>
    </main>
  )
}
