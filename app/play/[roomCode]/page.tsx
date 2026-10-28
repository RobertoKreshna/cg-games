'use client'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import { getRoomState } from '@/lib/api'
import { getPlayerSessionRaw, parsePlayerSession } from '@/lib/tokens'
import { BibleQuiz } from '@/components/games/BibleQuiz'
import { VerseScramble } from '@/components/games/VerseScramble'
import { EmojiStory } from '@/components/games/EmojiStory'
import type { BibleQuizContent, EmojiStoryContent, GameType, VerseScrambleContent } from '@/types/game'

type Phase = 'lobby' | 'question' | 'answered' | 'reveal'

interface ActiveQuestion {
  questionId: string
  gameType: GameType
  content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent
  questionIndex: number
  totalQuestions: number
}

interface GameState {
  phase: Phase
  sessionId: string | null
  question: ActiveQuestion | null
  lastPoints: number | null
  submittedAnswer: string | null
  correctAnswer: unknown
}

const INITIAL: GameState = {
  phase: 'lobby', sessionId: null, question: null, lastPoints: null, submittedAnswer: null, correctAnswer: null,
}

const PHASE_ORDER: Record<Phase, number> = { lobby: 0, question: 1, answered: 2, reveal: 3 }

interface ServerState {
  phase: Phase | 'finished'
  session_id?: string
  current_question?: {
    question_id: string
    game_type: GameType
    content: ActiveQuestion['content']
    question_index: number
    total_questions: number
  }
  points?: number | null
  submitted_answer?: string | null
  correct_answer?: unknown
}

// Merges the server's view into local state. For the same question the local phase never moves
// backwards (a slow response must not undo a reveal that already arrived by broadcast).
function applyServerState(prev: GameState, data: ServerState): GameState {
  const sessionId = data.session_id ?? prev.sessionId
  const cq = data.current_question
  if (!cq || data.phase === 'finished') return { ...prev, sessionId }

  if (prev.question?.questionId === cq.question_id && PHASE_ORDER[prev.phase] > PHASE_ORDER[data.phase as Phase]) {
    return { ...prev, sessionId }
  }
  const sameQuestion = prev.question?.questionId === cq.question_id
  return {
    phase: data.phase as Phase,
    sessionId,
    question: sameQuestion ? prev.question : {
      questionId: cq.question_id,
      gameType: cq.game_type,
      content: cq.content,
      questionIndex: cq.question_index,
      totalQuestions: cq.total_questions,
    },
    lastPoints: data.points ?? (sameQuestion ? prev.lastPoints : null),
    submittedAnswer: data.submitted_answer ?? (sameQuestion ? prev.submittedAnswer : null),
    correctAnswer: data.correct_answer ?? (sameQuestion ? prev.correctAnswer : null),
  }
}

const subscribeNoop = () => () => {}

export default function PlayPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const router = useRouter()

  // localStorage is only readable on the client; the server snapshot keeps hydration consistent.
  const sessionReady = useSyncExternalStore(subscribeNoop, () => true, () => false)
  const rawSession = useSyncExternalStore(subscribeNoop, () => getPlayerSessionRaw(roomCode), () => null)
  const session = useMemo(() => parsePlayerSession(rawSession), [rawSession])
  const sessionToken = session?.sessionToken

  const [game, setGame] = useState<GameState>(INITIAL)
  const { phase, question, lastPoints, submittedAnswer, correctAnswer, sessionId } = game

  const sync = useCallback(() => {
    if (!sessionToken) return
    getRoomState(roomCode, sessionToken).then((data: ServerState) => {
      if (data.phase === 'finished') {
        router.push(`/results/${data.session_id}`)
      } else {
        setGame((prev) => applyServerState(prev, data))
      }
    }).catch(() => {})
  }, [roomCode, sessionToken, router])

  useEffect(() => { sync() }, [sync])

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.event === 'game_started') {
      setGame((prev) => ({ ...prev, sessionId: e.payload.session_id }))
    } else if (e.event === 'question_show') {
      setGame((prev) => ({
        phase: 'question',
        sessionId: e.payload.session_id ?? prev.sessionId,
        question: {
          questionId: e.payload.question_id,
          gameType: e.payload.game_type,
          content: e.payload.content,
          questionIndex: e.payload.question_index,
          totalQuestions: e.payload.total_questions,
        },
        lastPoints: null,
        submittedAnswer: null,
        correctAnswer: null,
      }))
    } else if (e.event === 'question_reveal') {
      setGame((prev) => ({ ...prev, correctAnswer: e.payload.correct_answer, phase: 'reveal' }))
    } else if (e.event === 'game_finished') {
      router.push(`/results/${e.payload.session_id}`)
    }
  }, [router])

  useGameChannel(roomCode, handleEvent, sync)

  // Late replies after the reveal must not pull the player back to the "answered" screen.
  const handleAnswered = useCallback((pts: number, sub: string) => {
    setGame((prev) => ({ ...prev, lastPoints: pts, submittedAnswer: sub, phase: prev.phase === 'reveal' ? prev.phase : 'answered' }))
  }, [])

  if (!sessionReady) return null

  if (!session) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full">
          <p className="text-mist text-sm font-semibold">Session tidak ditemukan.</p>
          <a href="/join" className="text-gold text-sm font-bold underline underline-offset-4">
            Join ulang
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh flex flex-col">
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="card w-32 h-32 flex items-center justify-center text-5xl">
            <span className="animate-float inline-block">⏳</span>
          </div>
          <div className="text-center">
            <p className="font-display text-xl font-semibold">Menunggu host...</p>
            <p className="text-mist text-sm mt-1 font-semibold">Game segera dimulai</p>
          </div>
          <div className="card px-5 py-2.5 flex items-center gap-2">
            <span className="tag">Room</span>
            <span className="font-display text-gold font-semibold tracking-widest text-xl">{roomCode}</span>
          </div>
        </div>
      )}

      {phase === 'question' && question && sessionId && (
        <div className="flex-1 flex flex-col">
          {question.gameType === 'bible_quiz' && (
            <BibleQuiz
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as BibleQuizContent}
              sessionId={sessionId}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={handleAnswered}
            />
          )}
          {question.gameType === 'verse_scramble' && (
            <VerseScramble
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as VerseScrambleContent}
              sessionId={sessionId}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={handleAnswered}
            />
          )}
          {question.gameType === 'emoji_story' && (
            <EmojiStory
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as EmojiStoryContent}
              sessionId={sessionId}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={handleAnswered}
            />
          )}
        </div>
      )}

      {(phase === 'answered' || phase === 'reveal') && (
        <div role="status" aria-live="polite" className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          {lastPoints !== null ? (
            <>
              <div className="text-6xl animate-pop-in">
                {lastPoints >= 800 ? '🎉' : lastPoints >= 500 ? '🔥' : lastPoints > 0 ? '👍' : '😅'}
              </div>
              <div className="card px-10 py-6 flex flex-col items-center gap-1 text-center animate-pop-in">
                <span className="font-display text-5xl font-semibold text-gold tabular-nums">+{lastPoints}</span>
                <span className="tag">poin</span>
              </div>
            </>
          ) : (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <p className="text-mist text-sm font-semibold">Menunggu soal berikutnya...</p>
            </div>
          )}

          {phase === 'reveal' && correctAnswer != null && question && (() => {
            if (question.gameType === 'bible_quiz') {
              const correct = correctAnswer as number
              const submitted = submittedAnswer !== null ? parseInt(submittedAnswer) : -1
              const c = question.content as BibleQuizContent
              return (
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {c.options.map((opt, i) => {
                    const isCorrect = i === correct
                    const isWrong = submitted >= 0 && i === submitted && i !== correct
                    return (
                      <div key={i} className={`px-3 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                        isCorrect ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200'
                        : isWrong ? 'bg-rose-400/15 border-rose-400/60 text-rose-200'
                        : 'bg-white/5 border-line text-faint'
                      }`}>
                        <span className="text-xs font-bold w-4 shrink-0">{['A','B','C','D'][i]}</span>
                        <span className="flex-1">{opt}</span>
                        {isCorrect && <span className="text-emerald-300 text-xs">✓</span>}
                        {isWrong && <span className="text-rose-300 text-xs">✗</span>}
                      </div>
                    )
                  })}
                </div>
              )
            }

            if (question.gameType === 'verse_scramble') {
              const correct = Array.isArray(correctAnswer) ? correctAnswer as number[] : []
              const submitted = submittedAnswer ? JSON.parse(submittedAnswer) as number[] : []
              const c = question.content as VerseScrambleContent
              return (
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  {submitted.length > 0 && (
                    <div>
                      <p className="tag mb-1.5">Jawabanmu</p>
                      <div className="flex flex-wrap gap-1.5">
                        {submitted.map((wi, pos) => (
                          <span key={pos} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            correct[pos] === wi ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'
                          }`}>{c.words[wi]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="tag mb-1.5">Urutan Benar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {correct.map((wi, pos) => (
                        <span key={pos} className="bg-emerald-400/20 text-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                          {c.words[wi]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            }

            if (question.gameType === 'emoji_story') {
              const correct = Array.isArray(correctAnswer) ? correctAnswer as number[] : []
              const submitted = submittedAnswer ? JSON.parse(submittedAnswer) as number[] : []
              const c = question.content as EmojiStoryContent
              return (
                <div className="grid grid-cols-2 gap-1.5 w-full max-w-xs">
                  {c.words.map((word, i) => {
                    const isSelected = submitted.includes(i)
                    const isCorrect = correct.includes(i)
                    const cls = isSelected && isCorrect ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/60'
                      : isSelected && !isCorrect ? 'bg-rose-400/15 text-rose-200 border-rose-400/60'
                      : !isSelected && isCorrect ? 'bg-white/5 text-emerald-300 border-emerald-400/60'
                      : 'bg-white/5 text-faint border-line'
                    return (
                      <div key={i} className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${cls}`}>
                        <span>{word}</span>
                        {isSelected && isCorrect && <span>✓</span>}
                        {isSelected && !isCorrect && <span>✗</span>}
                        {!isSelected && isCorrect && <span>✓</span>}
                      </div>
                    )
                  })}
                </div>
              )
            }

            return null
          })()}

          <p className="text-faint text-xs font-semibold animate-pulse">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
