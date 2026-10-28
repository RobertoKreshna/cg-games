'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, assignTeams, startGame, nextQuestion, revealQuestion, kickPlayer, endGame, getHostState } from '@/lib/api'
import { TIMER_MS, DEADLINE_GRACE_MS, timerMsOf } from '@/lib/scoring'
import { MEMORY_CARD_COUNTS, MEMORY_DELAYS_MS, MEMORY_DEFAULT_CARDS, MEMORY_DEFAULT_DELAY_MS } from '@/lib/memory-rules'
import { now } from '@/lib/clock'
import { useWakeLock } from '@/lib/wake-lock'
import { StandingsCard } from '@/components/shared/Standings'
import { JoinQr } from '@/components/shared/JoinQr'
import { ConnectionBanner } from '@/components/shared/ConnectionBanner'
import { HostQuestionCard } from '@/components/shared/HostQuestionCard'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { saveHostSession, updateHostSession, setCurrentHostRoom, getCurrentHostRoom, getHostSession, clearHostSession } from '@/lib/tokens'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import type { GameType, PublicQuestion, RoomMode, Standings } from '@/types/game'

type HostPhase = 'configure' | 'lobby' | 'playing' | 'finished'

interface HostState {
  phase: 'lobby' | 'playing' | 'finished'
  gameType: GameType
  mode: RoomMode
  players?: PlayerInfo[]
  teamsAssigned?: boolean
  session_id?: string
  questionStatus?: 'idle' | 'showing' | 'reveal'
  currentQ?: number
  totalQ?: number
  answeredIds?: string[]
  questionElapsedMs?: number | null
  standings?: Standings | null
  currentQuestion?: { gameType: GameType; content: Record<string, unknown> } | null
  correctAnswer?: unknown
}

interface PlayerInfo { id: string; name: string; teamName?: string; teamColor?: string }

const GAME_OPTIONS: { type: GameType; emoji: string; label: string; desc: string }[] = [
  { type: 'bible_quiz', emoji: '📖', label: 'Bible Quiz', desc: `Pilihan ganda · ${TIMER_MS.bible_quiz / 1000} detik` },
  { type: 'verse_scramble', emoji: '📝', label: 'Verse Scramble', desc: `Susun ayat · ${TIMER_MS.verse_scramble / 1000} detik` },
  { type: 'emoji_story', emoji: '🎭', label: 'Emoji Story', desc: `Tebak kisah · ${TIMER_MS.emoji_story / 1000} detik` },
  { type: 'memory_match', emoji: '🧩', label: 'Memory Ayat', desc: 'Cocokkan kartu · tebak ayat' },
]

export default function HostPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<HostPhase>('configure')
  const [gameType, setGameType] = useState<GameType>('bible_quiz')
  const [mode, setMode] = useState<RoomMode>('individual')
  const [questionCount, setQuestionCount] = useState(10)
  const [memoryCards, setMemoryCards] = useState<number>(MEMORY_DEFAULT_CARDS)
  const [memoryDelayMs, setMemoryDelayMs] = useState<number>(MEMORY_DEFAULT_DELAY_MS)
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
  const [standings, setStandings] = useState<Standings | null>(null)
  const [question, setQuestion] = useState<PublicQuestion | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<unknown>(null)
  // When the host reveals on its own if players have not all answered (timer + grace).
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [kickTarget, setKickTarget] = useState<PlayerInfo | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Applies the server's view of the room. `initial` is the first load after a page refresh.
  const applyHostState = useCallback((code: string, token: string, savedSessionId: string | undefined, data: HostState, initial: boolean) => {
    setPlayers(data.players ?? [])
    setTeamsAssigned(data.teamsAssigned ?? false)
    if (data.phase === 'playing') {
      setSessionId(data.session_id ?? savedSessionId ?? '')
      setQuestionStatus(data.questionStatus ?? 'idle')
      setCurrentQ(data.currentQ ?? 0)
      setTotalQ(data.totalQ ?? 0)
      setAnsweredIds(new Set(data.answeredIds ?? []))
      setStandings(data.standings ?? null)
      setQuestion(data.currentQuestion ? { gameType: data.currentQuestion.gameType, content: data.currentQuestion.content } : null)
      setCorrectAnswer(data.correctAnswer ?? null)
      setDeadlineAt(
        data.questionStatus === 'showing' && data.questionElapsedMs != null
          ? now() + timerMsOf(data.gameType, data.currentQuestion?.content) + DEADLINE_GRACE_MS - data.questionElapsedMs
          : null,
      )
      setPhase('playing')
    } else if (data.phase === 'finished') {
      setSessionId(data.session_id ?? savedSessionId ?? '')
      setPhase('finished')
      clearHostSession(code) // game over, no need to restore next time
    } else if (initial) {
      setPhase('lobby')
    }
    if (initial) {
      setRoomCode(code)
      setHostToken(token)
      setGameType(data.gameType)
      setMode(data.mode)
    }
  }, [])

  useEffect(() => {
    const code = getCurrentHostRoom()
    if (!code) return
    const saved = getHostSession(code)
    if (!saved) return
    getHostState(code, saved.hostToken)
      .then((data) => applyHostState(code, saved.hostToken, saved.sessionId, data, true))
      .catch(() => {})
  }, [applyHostState])

  // After a dropped connection, re-read the room: events sent in the gap are not replayed.
  const resync = useCallback(() => {
    if (!roomCode || !hostToken) return
    getHostState(roomCode, hostToken)
      .then((data) => applyHostState(roomCode, hostToken, sessionId || undefined, data, false))
      .catch(() => {})
  }, [roomCode, hostToken, sessionId, applyHostState])

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.event === 'player_joined') {
      setPlayers((prev) => prev.some((p) => p.id === e.payload.player_id) ? prev : [...prev, { id: e.payload.player_id, name: e.payload.name }])
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
      setStandings(null)
      setQuestion({ gameType: e.payload.game_type, content: e.payload.content as unknown as Record<string, unknown> })
      setCorrectAnswer(null)
      setSecondsLeft(null)
      setDeadlineAt(now() + timerMsOf(gameType, e.payload.content) + DEADLINE_GRACE_MS)
    } else if (e.event === 'player_answered') {
      setAnsweredIds((prev) => new Set(prev).add(e.payload.player_id))
    } else if (e.event === 'question_reveal') {
      setQuestionStatus('reveal')
      setStandings(e.payload.standings ?? null)
      setCorrectAnswer(e.payload.correct_answer)
      setDeadlineAt(null)
    } else if (e.event === 'game_finished') {
      setPhase('finished')
    } else if (e.event === 'player_kicked') {
      setPlayers((prev) => prev.filter((p) => p.id !== e.payload.player_id))
      setAnsweredIds((prev) => { const next = new Set(prev); next.delete(e.payload.player_id); return next })
    } else if (e.event === 'room_closed') {
      clearHostSession(roomCode)
      router.push('/')
    }
  }, [gameType, roomCode, router])

  const connection = useGameChannel(roomCode || null, handleEvent, resync)
  useWakeLock(phase === 'lobby' || phase === 'playing')

  // Players' own timers normally end the round; this covers anyone who left or lost connection.
  useEffect(() => {
    if (questionStatus !== 'showing' || deadlineAt === null || !sessionId) return
    const id = setTimeout(() => {
      revealQuestion(sessionId, hostToken).catch(() => {})
    }, Math.max(0, deadlineAt - now()))
    return () => clearTimeout(id)
  }, [questionStatus, deadlineAt, sessionId, hostToken])

  useEffect(() => {
    if (questionStatus !== 'showing' || deadlineAt === null) return
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadlineAt - DEADLINE_GRACE_MS - now()) / 1000)))
    }, 500)
    return () => clearInterval(id)
  }, [questionStatus, deadlineAt])

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const data = await createRoom(
        gameType, mode, questionCount,
        gameType === 'memory_match' ? { cards: memoryCards, delayMs: memoryDelayMs } : undefined,
      )
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

  async function handleReveal() {
    if (!sessionId) return
    setLoading(true)
    setError('')
    try {
      await revealQuestion(sessionId, hostToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menampilkan jawaban.')
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

  async function handleKick() {
    if (!kickTarget) return
    const target = kickTarget
    setLoading(true)
    setError('')
    try {
      await kickPlayer(roomCode, hostToken, target.id)
      setPlayers((prev) => prev.filter((p) => p.id !== target.id))
      setAnsweredIds((prev) => { const next = new Set(prev); next.delete(target.id); return next })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengeluarkan pemain.')
    } finally {
      setKickTarget(null)
      setLoading(false)
    }
  }

  async function handleEnd() {
    setLoading(true)
    setError('')
    try {
      const result = await endGame(roomCode, hostToken)
      setConfirmEnd(false)
      if (result.status === 'closed') {
        clearHostSession(roomCode)
        router.push('/')
      } else {
        if (result.session_id) setSessionId(result.session_id)
        setPhase('finished')
      }
    } catch (e) {
      setConfirmEnd(false)
      setError(e instanceof Error ? e.message : 'Gagal mengakhiri game.')
    } finally {
      setLoading(false)
    }
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!kickTarget}
        title={`Keluarkan ${kickTarget?.name ?? ''}?`}
        description="Pemain ini keluar dari room dan skornya dihapus. Dia bisa gabung lagi lewat kode room selama game belum dimulai."
        confirmLabel="Keluarkan"
        danger
        busy={loading}
        onConfirm={handleKick}
        onCancel={() => setKickTarget(null)}
      />
      <ConfirmDialog
        open={confirmEnd}
        title={phase === 'lobby' ? 'Tutup room?' : 'Akhiri game sekarang?'}
        description={phase === 'lobby' ? 'Semua pemain akan keluar dan kode room tidak berlaku lagi.' : 'Skor sementara menjadi hasil akhir untuk semua pemain.'}
        confirmLabel={phase === 'lobby' ? 'Tutup room' : 'Akhiri game'}
        danger
        busy={loading}
        onConfirm={handleEnd}
        onCancel={() => setConfirmEnd(false)}
      />
    </>
  )

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
                      ? 'bg-raised border-accent'
                      : 'bg-surface border-line'
                  }`}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{g.label}</p>
                    <p className="text-mist text-xs mt-0.5 font-semibold">{g.desc}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    gameType === g.type ? 'border-accent bg-accent' : 'border-faint'
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
                    mode === m ? 'bg-pick text-white' : 'text-mist'
                  }`}
                >
                  {m === 'individual' ? '👤 Individual' : '👥 Tim'}
                </button>
              ))}
            </div>
          </div>

          {gameType !== 'memory_match' && (
            <div>
              <p className="tag mb-3">Jumlah Soal</p>
              <div className="card p-1 flex gap-1">
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                      questionCount === n ? 'bg-pick text-white' : 'text-mist'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameType === 'memory_match' && (
            <>
              <div>
                <p className="tag mb-3">Jumlah Kartu</p>
                <div className="card p-1 flex gap-1">
                  {MEMORY_CARD_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setMemoryCards(n)}
                      aria-pressed={memoryCards === n}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${memoryCards === n ? 'bg-pick text-white' : 'text-mist'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="tag mb-3">Kartu Salah Tertutup Setelah</p>
                <div className="card p-1 flex gap-1">
                  {MEMORY_DELAYS_MS.map((ms) => (
                    <button
                      key={ms}
                      onClick={() => setMemoryDelayMs(ms)}
                      aria-pressed={memoryDelayMs === ms}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${memoryDelayMs === ms ? 'bg-pick text-white' : 'text-mist'}`}
                    >
                      {ms / 1000} dtk
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

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
        <ConnectionBanner status={connection} />
        <div className="w-full max-w-sm flex flex-col flex-1">
        <div className="mb-5 text-center">
          <p className="tag mb-2">Kode Room</p>
          <h2 className="font-display text-6xl font-semibold text-accent tracking-[0.18em] drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]">
            {roomCode}
          </h2>
          <p className="text-mist text-xs mt-3 font-bold">
            {GAME_OPTIONS.find((g) => g.type === gameType)?.label} · {mode === 'individual' ? 'Individual' : 'Tim'}
          </p>
        </div>

        <JoinQr roomCode={roomCode} />

        <div className="card p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
          <p className="tag mb-3">{players.length} player bergabung</p>
          <div className="flex flex-wrap gap-2">
            {players.length === 0 && (
              <p className="text-faint text-sm text-center py-4 w-full animate-pulse">Menunggu player...</p>
            )}
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => setKickTarget(p)}
                aria-label={`Keluarkan ${p.name}`}
                className="animate-pop-in bg-raised border border-line rounded-full pl-2.5 pr-3 py-1.5 flex items-center gap-2 text-sm font-bold cursor-pointer hover:border-rose-400/60 transition-colors"
              >
                {p.teamColor
                  ? <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.teamColor }} />
                  : <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0 bg-accent" />
                }
                {p.name}
                {p.teamName && <span className="text-faint text-[10px] uppercase tracking-wider">{p.teamName}</span>}
              </button>
            ))}
          </div>
          {players.length > 0 && <p className="text-faint text-xs font-semibold mt-3">Ketuk nama untuk mengeluarkan pemain</p>}
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
        <button onClick={() => setConfirmEnd(true)} disabled={loading} className="text-faint text-sm font-bold py-3 mt-1 cursor-pointer hover:text-rose-300 transition-colors">
          Tutup room
        </button>
        </div>
        {dialogs}
      </main>
    )
  }

  if (phase === 'playing') {
    const isLast = totalQ > 0 && currentQ >= totalQ
    const showQuestion = question && (questionStatus === 'showing' || questionStatus === 'reveal')
    return (
      <main className="min-h-dvh flex flex-col px-6 pt-6 items-center">
        <ConnectionBanner status={connection} />
        <div className="w-full max-w-sm flex flex-col flex-1">
        <div className="flex justify-between items-center mb-5">
          <div>
            <p className="tag">{roomCode}</p>
            <p className="font-bold text-sm mt-0.5">
              {GAME_OPTIONS.find((g) => g.type === gameType)?.label}
            </p>
          </div>
          {totalQ > 0 && (
            <span className="bg-raised border border-line rounded-full px-3 py-1 text-accent text-sm font-bold tabular-nums">
              {currentQ} / {totalQ}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 pb-4">
          {questionStatus === 'idle' && (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <p className="text-mist text-sm font-semibold">Tekan tombol untuk mulai soal pertama</p>
            </div>
          )}
          {showQuestion && (
            <HostQuestionCard question={question} correctAnswer={correctAnswer} revealed={questionStatus === 'reveal'} />
          )}
          {(questionStatus === 'showing' || questionStatus === 'reveal') && (
            <div className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">
                  {questionStatus === 'showing' ? (
                    <span className="animate-pulse">
                      ⏱ Menunggu jawaban{secondsLeft !== null && <span className="tabular-nums"> · {secondsLeft} dtk</span>}
                    </span>
                  ) : '✅ Semua sudah menjawab'}
                </p>
                <span className="text-mist text-xs font-bold tabular-nums">
                  {questionStatus === 'reveal' ? players.length : answeredIds.size} / {players.length}
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {players.map((p) => {
                  const done = questionStatus === 'reveal' || answeredIds.has(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setKickTarget(p)}
                        title={p.teamName}
                        aria-label={`Keluarkan ${p.name}`}
                        className={`inline-flex items-center gap-1.5 max-w-[11rem] rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer hover:border-rose-400/60 ${
                          done ? 'bg-emerald-400/15 border-emerald-400/50 text-white' : 'bg-white/5 border-line text-faint'
                        }`}
                      >
                        <span aria-hidden className={`w-3.5 h-3.5 rounded-full shrink-0 grid place-items-center text-[8px] leading-none ${done ? 'bg-[#22C55E] text-white' : 'bg-white/10'}`}>
                          {done && '✓'}
                        </span>
                        <span className="truncate">{p.name}</span>
                        {p.teamColor && <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.teamColor }} />}
                        <span className="sr-only">{done ? ', sudah menjawab' : ', belum menjawab'}{p.teamName ? `, ${p.teamName}` : ''}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {questionStatus === 'reveal' && standings && (
            <div className="flex justify-center">
              <StandingsCard standings={standings} />
            </div>
          )}
        </div>

        {/* Stays on screen however long the list above gets (30 players, long questions). */}
        <div className="sticky bottom-0 mt-auto pt-6 pb-6 bg-gradient-to-t from-night from-60% to-transparent">
          {error && <p className="text-rose-300 text-xs font-semibold text-center mb-2">{error}</p>}
          <button
            onClick={handleNext}
            disabled={loading || questionStatus === 'showing'}
            className="btn-primary py-4 text-base w-full"
          >
            {loading ? '...' : questionStatus === 'idle' ? '▶ Mulai' : isLast ? '🏁 Lihat Hasil Akhir' : '⏭ Soal Berikutnya'}
          </button>
          {questionStatus === 'showing' && (
            <button onClick={handleReveal} disabled={loading} className="btn-secondary py-3 text-sm w-full mt-2">
              Tampilkan jawaban sekarang
            </button>
          )}
          <button onClick={() => setConfirmEnd(true)} disabled={loading} className="block mx-auto text-faint text-xs font-bold pt-3 cursor-pointer hover:text-rose-300 transition-colors">
            Akhiri game
          </button>
        </div>
        </div>
        {dialogs}
      </main>
    )
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-10 text-center">
        <div className="text-6xl mb-2 animate-pop-in">🏆</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Game Selesai!</h1>
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
