'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, assignTeams, startGame, nextQuestion } from '@/lib/api'
import { saveHostSession, updateHostSession } from '@/lib/tokens'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import type { GameType, RoomMode } from '@/types/game'

type HostPhase = 'configure' | 'lobby' | 'playing' | 'finished'

interface PlayerInfo { id: string; name: string; teamName?: string; teamColor?: string }

const GAME_OPTIONS: { type: GameType; emoji: string; label: string; desc: string }[] = [
  { type: 'bible_quiz', emoji: '📖', label: 'Bible Quiz', desc: 'Pilihan ganda · 15 detik' },
  { type: 'verse_scramble', emoji: '📝', label: 'Verse Scramble', desc: 'Susun ayat · 30 detik' },
  { type: 'emoji_story', emoji: '🎭', label: 'Emoji Story', desc: 'Tebak kisah · 20 detik' },
]

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
      <main className="app-bg grid-bg min-h-screen flex flex-col p-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-56 rounded-full bg-violet-700/18 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <button onClick={() => router.back()} className="text-white/35 text-sm mb-7 flex items-center gap-1.5 hover:text-white/60 transition-colors">
            ← Kembali
          </button>
          <h1 className="heading text-4xl text-white mb-1">Buat Room</h1>
          <p className="text-white/35 text-sm mb-8">Pilih game dan mode bermain</p>
        </div>

        <div className="relative z-10 flex flex-col gap-6 max-w-sm">
          <div>
            <p className="label-tag mb-3">Pilih Game</p>
            <div className="flex flex-col gap-2">
              {GAME_OPTIONS.map((g) => (
                <button
                  key={g.type}
                  onClick={() => setGameType(g.type)}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all ${
                    gameType === g.type
                      ? 'bg-amber-500/20 border border-amber-500/50'
                      : 'glass-card-sm border-transparent'
                  }`}
                  style={{ border: gameType === g.type ? '1px solid rgba(245,184,0,0.5)' : '1px solid rgba(255,255,255,0.09)' }}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <p className={`font-bold text-base ${gameType === g.type ? 'text-gold' : 'text-white'}`}>{g.label}</p>
                    <p className="text-white/40 text-xs mt-0.5">{g.desc}</p>
                  </div>
                  {gameType === g.type && <span className="text-gold text-lg">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label-tag mb-3">Mode</p>
            <div className="glass-card-sm p-1 flex gap-1">
              {(['individual', 'team'] as RoomMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                    mode === m
                      ? 'bg-white/15 text-white'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {m === 'individual' ? '👤 Individual' : '👥 Tim'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn-primary py-4 text-lg w-full mt-2"
          >
            {loading ? 'Membuat...' : 'Buat Room →'}
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'lobby') {
    return (
      <main className="app-bg grid-bg min-h-screen flex flex-col p-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-56 rounded-full bg-violet-700/18 blur-3xl pointer-events-none" />

        <div className="relative z-10 mb-6">
          <p className="label-tag mb-1">Kode Room</p>
          <h2 className="heading text-6xl text-white tracking-[0.2em]">{roomCode}</h2>
          <p className="text-white/35 text-xs mt-2 uppercase tracking-wider">
            {GAME_OPTIONS.find((g) => g.type === gameType)?.label} · {mode === 'individual' ? 'Individual' : 'Tim'}
          </p>
        </div>

        <div className="relative z-10 glass-card p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
          <p className="label-tag mb-3">{players.length} player bergabung</p>
          <div className="flex flex-col gap-1.5">
            {players.length === 0 && (
              <p className="text-white/25 text-sm text-center py-4 italic">Menunggu player...</p>
            )}
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 text-white py-1">
                {p.teamColor && (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.teamColor }} />
                )}
                <span className="font-semibold text-sm">{p.name}</span>
                {p.teamName && <span className="text-white/35 text-xs ml-auto">{p.teamName}</span>}
              </div>
            ))}
          </div>
        </div>

        {mode === 'team' && (
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="glass-card-sm px-3 py-2">
              <select
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="bg-transparent text-white outline-none text-sm font-semibold"
              >
                {[2, 3, 4, 5].map((n) => <option key={n} value={n} className="bg-gray-900">{n} tim</option>)}
              </select>
            </div>
            <button
              onClick={handleAssignTeams}
              disabled={loading || players.length === 0}
              className="flex-1 btn-glass py-2.5 text-sm"
            >
              {teamsAssigned ? '🔀 Acak Ulang' : '🎲 Acak Tim'}
            </button>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || players.length === 0 || (mode === 'team' && !teamsAssigned)}
          className="btn-primary py-4 text-lg w-full relative z-10"
        >
          {loading ? '...' : '▶ Mulai Game'}
        </button>
        {mode === 'team' && !teamsAssigned && players.length > 0 && (
          <p className="text-amber-400/70 text-xs text-center mt-2 relative z-10">Acak tim dulu sebelum mulai</p>
        )}
      </main>
    )
  }

  if (phase === 'playing') {
    return (
      <main className="app-bg grid-bg min-h-screen flex flex-col p-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-56 rounded-full bg-violet-700/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex justify-between items-center mb-6">
          <div>
            <p className="label-tag">{roomCode}</p>
            <p className="text-white font-bold mt-0.5">{GAME_OPTIONS.find((g) => g.type === gameType)?.label}</p>
          </div>
          {totalQ > 0 && (
            <div className="glass-card-sm px-4 py-2">
              <span className="heading text-gold text-lg">{currentQ}</span>
              <span className="text-white/30 text-sm">/{totalQ}</span>
            </div>
          )}
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4">
          {questionStatus === 'idle' && (
            <div className="glass-card p-8 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">🎮</div>
              <p className="text-white/60 text-sm">Tekan tombol untuk mulai soal pertama</p>
            </div>
          )}
          {questionStatus === 'showing' && (
            <div className="glass-card p-8 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl animate-pulse">⏱</div>
              <p className="text-white font-bold">Player sedang menjawab...</p>
              <p className="text-white/35 text-sm">{players.length} player</p>
            </div>
          )}
          {questionStatus === 'reveal' && (
            <div className="glass-card p-8 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">✅</div>
              <p className="text-white font-bold">Semua sudah menjawab!</p>
              <p className="text-white/35 text-sm">Lanjut ke soal berikutnya</p>
            </div>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={loading || questionStatus === 'showing'}
          className="btn-primary py-4 text-xl w-full relative z-10"
        >
          {loading ? '...' : questionStatus === 'idle' ? '▶ Mulai' : '⏭ Soal Berikutnya'}
        </button>
      </main>
    )
  }

  return (
    <main className="app-bg grid-bg min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-2 mb-10">
        <div className="text-6xl">🏆</div>
        <h1 className="heading text-4xl text-white">Game Selesai!</h1>
        <p className="text-white/35 text-sm">Semua soal sudah selesai</p>
      </div>
      <div className="relative z-10 flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => router.push(`/results/${sessionId}`)}
          className="btn-primary py-4 text-lg w-full"
        >
          Lihat Leaderboard
        </button>
        <button
          onClick={() => router.push('/')}
          className="btn-glass py-3 text-base w-full"
        >
          Kembali ke Home
        </button>
      </div>
    </main>
  )
}
