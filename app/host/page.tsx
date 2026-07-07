'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, assignTeams, startGame, nextQuestion, getHostState } from '@/lib/api'
import { saveHostSession, updateHostSession, setCurrentHostRoom, getCurrentHostRoom, getHostSession, clearHostSession } from '@/lib/tokens'
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
  const [questionCount, setQuestionCount] = useState(10)
  const [roomCode, setRoomCode] = useState('')
  const [hostToken, setHostToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [teamCount, setTeamCount] = useState(3)
  const [teamsAssigned, setTeamsAssigned] = useState(false)
  const [questionStatus, setQuestionStatus] = useState<'idle' | 'showing' | 'reveal'>('idle')
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set())
  const [currentQ, setCurrentQ] = useState(0)
  const [totalQ, setTotalQ] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const code = getCurrentHostRoom()
    if (!code) return
    const saved = getHostSession(code)
    if (!saved) return
    getHostState(code, saved.hostToken).then((data) => {
      setRoomCode(code)
      setHostToken(saved.hostToken)
      setGameType(data.gameType)
      setMode(data.mode)
      setPlayers(data.players ?? [])
      setTeamsAssigned(data.teamsAssigned ?? false)
      if (data.phase === 'playing') {
        setSessionId(saved.sessionId ?? '')
        setQuestionStatus(data.questionStatus ?? 'idle')
        setCurrentQ(data.currentQ ?? 0)
        setTotalQ(data.totalQ ?? 0)
        setPhase('playing')
      } else if (data.phase === 'finished') {
        setSessionId(saved.sessionId ?? '')
        setPhase('finished')
        clearHostSession(code) // game over, no need to restore next time
      } else {
        setPhase('lobby')
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setAnsweredIds(new Set())
    } else if (e.event === 'player_answered') {
      setAnsweredIds((prev) => new Set(prev).add(e.payload.player_id))
    } else if (e.event === 'question_reveal') {
      setQuestionStatus('reveal')
    } else if (e.event === 'game_finished') {
      setPhase('finished')
    }
  }, [])

  useGameChannel(roomCode || null, handleEvent)

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const data = await createRoom(gameType, mode, questionCount)
      setRoomCode(data.code)
      setHostToken(data.host_token)
      saveHostSession(data.code, { hostToken: data.host_token, roomId: data.room_id })
      setCurrentHostRoom(data.code)
      setPhase('lobby')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat room.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignTeams() {
    setLoading(true)
    setError('')
    try {
      await assignTeams(roomCode, hostToken, teamCount)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengacak tim.')
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    setLoading(true)
    setError('')
    try {
      const data = await startGame(roomCode, hostToken)
      setSessionId(data.session_id)
      updateHostSession(roomCode, { sessionId: data.session_id })
      setPhase('playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memulai game.')
    } finally {
      setLoading(false)
    }
  }

  async function handleNext() {
    if (!sessionId) return
    setLoading(true)
    setError('')
    try {
      await nextQuestion(sessionId, hostToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat soal berikutnya.')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'configure') {
    return (
      <main className="min-h-dvh flex flex-col p-6 items-center">
        <div className="w-full max-w-sm">
        <button onClick={() => router.back()} className="text-mist text-sm font-bold mb-8 flex items-center gap-1 cursor-pointer">
          ← Kembali
        </button>

        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1">Buat Room</h1>
        <p className="text-mist text-sm font-semibold mb-8">Pilih game dan mode bermain</p>

        <div className="flex flex-col gap-6">
          <div>
            <p className="tag mb-3">Pilih Game</p>
            <div className="flex flex-col gap-2">
              {GAME_OPTIONS.map((g) => (
                <button
                  key={g.type}
                  onClick={() => setGameType(g.type)}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all border-2 cursor-pointer ${
                    gameType === g.type
                      ? 'bg-raised border-gold'
                      : 'bg-surface border-line'
                  }`}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{g.label}</p>
                    <p className="text-mist text-xs mt-0.5 font-semibold">{g.desc}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    gameType === g.type ? 'border-gold bg-gold' : 'border-faint'
                  }`}>
                    {gameType === g.type && <div className="w-1.5 h-1.5 rounded-full bg-night" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="tag mb-3">Mode</p>
            <div className="card p-1 flex gap-1">
              {(['individual', 'team'] as RoomMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    mode === m ? 'bg-grape text-white' : 'text-mist'
                  }`}
                >
                  {m === 'individual' ? '👤 Individual' : '👥 Tim'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="tag mb-3">Jumlah Soal</p>
            <div className="card p-1 flex gap-1">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    questionCount === n ? 'bg-grape text-white' : 'text-mist'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-rose-300 text-sm font-semibold text-center">{error}</p>}
          <button onClick={handleCreate} disabled={loading} className="btn-primary py-4 text-base w-full">
            {loading ? 'Membuat...' : 'Buat Room 🎉'}
          </button>
        </div>
        </div>
      </main>
    )
  }

  if (phase === 'lobby') {
    return (
      <main className="min-h-dvh flex flex-col p-6 items-center">
        <div className="w-full max-w-sm flex flex-col flex-1">
        <div className="mb-8 text-center">
          <p className="tag mb-2">Kode Room</p>
          <h2 className="font-display text-6xl font-semibold text-gold tracking-[0.18em] drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]">
            {roomCode}
          </h2>
          <p className="text-mist text-xs mt-3 font-bold">
            {GAME_OPTIONS.find((g) => g.type === gameType)?.label} · {mode === 'individual' ? 'Individual' : 'Tim'}
          </p>
        </div>

        <div className="card p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
          <p className="tag mb-3">{players.length} player bergabung</p>
          <div className="flex flex-wrap gap-2">
            {players.length === 0 && (
              <p className="text-faint text-sm text-center py-4 w-full animate-pulse">Menunggu player...</p>
            )}
            {players.map((p) => (
              <span key={p.id} className="animate-pop-in bg-raised border border-line rounded-full pl-2.5 pr-3 py-1.5 flex items-center gap-2 text-sm font-bold">
                {p.teamColor
                  ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.teamColor }} />
                  : <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-gold" />
                }
                {p.name}
                {p.teamName && <span className="text-faint text-[10px] uppercase tracking-wider">{p.teamName}</span>}
              </span>
            ))}
          </div>
        </div>

        {mode === 'team' && (
          <div className="flex items-center gap-3 mb-3">
            <div className="card px-3 py-2">
              <select
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="bg-transparent text-sm font-bold outline-none"
              >
                {[2, 3, 4, 5].map((n) => <option key={n} value={n} className="bg-night">{n} tim</option>)}
              </select>
            </div>
            <button
              onClick={handleAssignTeams}
              disabled={loading || players.length === 0}
              className="flex-1 btn-secondary py-2.5 text-sm"
            >
              {teamsAssigned ? '🔀 Acak Ulang' : '🎲 Acak Tim'}
            </button>
          </div>
        )}

        {error && <p className="text-rose-300 text-xs font-semibold text-center">{error}</p>}
        <button
          onClick={handleStart}
          disabled={loading || players.length === 0 || (mode === 'team' && !teamsAssigned)}
          className="btn-primary py-4 text-base w-full"
        >
          {loading ? '...' : '▶ Mulai Game'}
        </button>
        {mode === 'team' && !teamsAssigned && players.length > 0 && (
          <p className="text-mist text-xs font-semibold text-center mt-2">Acak tim dulu sebelum mulai</p>
        )}
        </div>
      </main>
    )
  }

  if (phase === 'playing') {
    return (
      <main className="min-h-dvh flex flex-col p-6 items-center">
        <div className="w-full max-w-sm flex flex-col flex-1">
        <div className="flex justify-between items-center mb-8">
          <div>
            <p className="tag">{roomCode}</p>
            <p className="font-bold text-sm mt-0.5">
              {GAME_OPTIONS.find((g) => g.type === gameType)?.label}
            </p>
          </div>
          {totalQ > 0 && (
            <span className="bg-raised border border-line rounded-full px-3 py-1 text-gold text-sm font-bold tabular-nums">
              {currentQ} / {totalQ}
            </span>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-3">
          {questionStatus === 'idle' && (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <p className="text-mist text-sm font-semibold">Tekan tombol untuk mulai soal pertama</p>
            </div>
          )}
          {(questionStatus === 'showing' || questionStatus === 'reveal') && (
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">
                  {questionStatus === 'showing' ? (
                    <span className="animate-pulse">⏱ Menunggu jawaban</span>
                  ) : '✅ Semua sudah menjawab'}
                </p>
                <span className="text-mist text-xs font-bold tabular-nums">
                  {questionStatus === 'reveal' ? players.length : answeredIds.size} / {players.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {players.map((p) => {
                  const done = questionStatus === 'reveal' || answeredIds.has(p.id)
                  return (
                    <div key={p.id} className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center transition-colors ${done ? 'bg-[#22C55E]' : 'bg-white/10'}`}>
                        {done && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                      </div>
                      <span className={`text-sm font-semibold transition-colors ${done ? 'text-white' : 'text-faint'}`}>
                        {p.name}
                      </span>
                      {p.teamName && <span className="text-faint text-xs ml-auto">{p.teamName}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-rose-300 text-xs font-semibold text-center">{error}</p>}
        <button
          onClick={handleNext}
          disabled={loading || questionStatus === 'showing'}
          className="btn-primary py-4 text-base w-full"
        >
          {loading ? '...' : questionStatus === 'idle' ? '▶ Mulai' : '⏭ Soal Berikutnya'}
        </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-10 text-center">
        <div className="text-6xl mb-2 animate-pop-in">🏆</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Game Selesai!</h1>
        <p className="text-mist text-sm font-semibold">Semua soal sudah selesai</p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button onClick={() => router.push(`/results/${sessionId}`)} className="btn-primary py-4 text-base w-full">
          Lihat Leaderboard 🏅
        </button>
        <button onClick={() => { clearHostSession(roomCode); router.push('/') }} className="btn-secondary py-3 text-base w-full">
          Kembali ke Home
        </button>
      </div>
    </main>
  )
}
