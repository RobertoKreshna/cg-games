'use client'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { MemoryQuizSheet } from '@/components/games/MemoryQuizSheet'
import { submitAnswer } from '@/lib/api'
import { now } from '@/lib/clock'
import { initialBoardState, isBoardFinished, makeBoardReducer, quizFor, toResult } from '@/lib/memory-board'
import type { MemoryBoard } from '@/lib/memory-rules'

interface Props {
  questionId: string
  content: MemoryBoard
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  /** Time already used when this question was loaded (refresh mid-question). */
  elapsedMs?: number
  onAnswered: (points: number, submittedAnswer: string) => void
}

/** How long the right/wrong feedback stays before the quiz closes by itself. */
const FEEDBACK_MS = 2000

const TEXT_BY_COLS: Record<number, string> = { 3: 'text-base', 4: 'text-sm', 5: 'text-[11px]' }

export function MemoryMatch({ questionId, content, sessionId, sessionToken, elapsedMs = 0, onAnswered }: Props) {
  const reducer = useMemo(() => makeBoardReducer(content), [content])
  const [state, dispatch] = useReducer(reducer, initialBoardState)
  const [sendError, setSendError] = useState(false)
  const [expired, setExpired] = useState(false)
  const startRef = useRef(0)
  const stateRef = useRef(state)
  const sentRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  })
  useEffect(() => {
    startRef.current = now() - elapsedMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two different cards stay visible for hideMs, then close.
  useEffect(() => {
    if (!state.locked) return
    const id = setTimeout(() => dispatch({ type: 'hideMismatch' }), content.hideMs)
    return () => clearTimeout(id)
  }, [state.locked, content.hideMs])

  // After an answer, the feedback closes by itself unless the player taps Lanjut first.
  useEffect(() => {
    if (state.chosen === null) return
    const id = setTimeout(() => dispatch({ type: 'closeQuiz' }), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [state.chosen])

  const submit = useCallback(async (elapsed: number): Promise<boolean> => {
    const submitted = JSON.stringify(toResult(stateRef.current))
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId, submitted_answer: submitted, time_taken_ms: elapsed,
      })
      onAnswered(result.points, submitted)
      return true
    } catch {
      return false
    }
  }, [sessionId, sessionToken, questionId, onAnswered])

  const finished = isBoardFinished(content, state)

  // Everything found and answered: send straight away (the time counts from the last answer).
  useEffect(() => {
    if (!finished || sentRef.current) return
    sentRef.current = true
    void (async () => {
      if (!(await submit(now() - startRef.current))) setSendError(true)
    })()
  }, [finished, submit])

  const retry = () => {
    setSendError(false)
    void (async () => {
      if (!(await submit(now() - startRef.current))) setSendError(true)
    })()
  }

  const handleExpire = useCallback(async () => {
    if (sentRef.current) return
    sentRef.current = true
    setExpired(true)
    // Time is up: send what there is; if even that fails there is no second chance.
    if (!(await submit(content.timerMs))) onAnswered(0, JSON.stringify(toResult(stateRef.current)))
  }, [submit, content.timerMs, onAnswered])

  const over = finished || expired
  const pairs = content.quiz.length
  const open = (id: number) => state.flipped.includes(id)
  const found = (pair: number) => state.matched.includes(pair)
  const activeQuiz = state.quizPair !== null ? quizFor(content, state.quizPair) : undefined
  const activeReference = state.quizPair !== null ? content.cards.find((c) => c.pair === state.quizPair)?.text ?? '' : ''
  const textSize = TEXT_BY_COLS[content.cols] ?? 'text-sm'

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-2">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-night/90 backdrop-blur flex items-center justify-between">
        <p className="tag tabular-nums">
          {state.matched.length} / {pairs} pasang · {state.mistakes} salah
        </p>
        <Timer compact durationMs={Math.max(500, content.timerMs - elapsedMs)} onExpire={handleExpire} />
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${content.cols}, minmax(0, 1fr))` }}>
        {content.cards.map((card) => {
          const matched = found(card.pair)
          const faceUp = matched || open(card.id)
          return (
            <button
              key={card.id}
              onClick={() => dispatch({ type: 'flip', id: card.id })}
              disabled={faceUp || state.locked || state.quizPair !== null || over}
              aria-label={faceUp ? `Kartu ${card.id + 1}, terbuka: ${card.text}` : `Kartu ${card.id + 1}, tertutup`}
              className={`aspect-square rounded-xl border-2 p-1 flex items-center justify-center text-center font-bold leading-tight break-words transition-colors ${textSize} ${
                matched ? 'bg-accent/20 border-accent text-white'
                : faceUp ? 'bg-raised border-white/40 text-white'
                : 'bg-surface border-line text-faint cursor-pointer active:scale-95'
              }`}
            >
              {faceUp ? <span className="animate-pop-in">{card.text}</span> : <span aria-hidden>?</span>}
            </button>
          )
        })}
      </div>

      {sendError && (
        <div role="alert" className="flex flex-col items-center gap-2">
          <p className="text-rose-300 text-xs font-semibold text-center">Jawaban belum terkirim. Periksa koneksi, lalu coba lagi.</p>
          <button onClick={retry} className="btn-primary py-2.5 px-6 text-sm">Kirim ulang</button>
        </div>
      )}

      {activeQuiz && (
        <MemoryQuizSheet
          reference={activeReference}
          options={activeQuiz.options}
          answer={activeQuiz.answer}
          chosen={state.chosen}
          onChoose={(option) => dispatch({ type: 'answer', option })}
          onContinue={() => dispatch({ type: 'closeQuiz' })}
        />
      )}
    </div>
  )
}
