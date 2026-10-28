'use client'
import { useEffect, useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import { now } from '@/lib/clock'
import { TIMER_MS } from '@/lib/scoring'
import type { BibleQuizContent } from '@/types/game'

interface Props {
  questionId: string
  content: BibleQuizContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  /** Time already spent on this question, e.g. when the page was refreshed mid-question. */
  elapsedMs?: number
  onAnswered: (points: number, submittedAnswer: string) => void
}

const OPTIONS = [
  { label: 'A', shape: '▲', bg: '#FF6B81', shadow: '#C23A52', text: 'text-night' },
  { label: 'B', shape: '◆', bg: '#38BDF8', shadow: '#0E86B8', text: 'text-night' },
  { label: 'C', shape: '●', bg: '#FFD43B', shadow: '#B8960C', text: 'text-night' },
  { label: 'D', shape: '■', bg: '#4ADE80', shadow: '#1E9A52', text: 'text-night' },
]

export function BibleQuiz({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, elapsedMs = 0, onAnswered }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [sendError, setSendError] = useState(false)
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = now() - elapsedMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSubmit(index: number, elapsed: number): Promise<boolean> {
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId,
        submitted_answer: String(index),
        time_taken_ms: elapsed,
      })
      onAnswered(result.points, String(index))
      return true
    } catch {
      return false
    }
  }

  async function handleSelect(index: number) {
    if (answered) return
    setSelected(index)
    setAnswered(true)
    setSendError(false)
    if (!(await doSubmit(index, now() - startRef.current))) {
      // Not recorded by the server: let the player tap again while time remains.
      setAnswered(false)
      setSelected(null)
      setSendError(true)
    }
  }

  function handleExpire() {
    if (answered) return
    setAnswered(true)
    submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: '-1',
      time_taken_ms: TIMER_MS.bible_quiz,
    }).then((r) => onAnswered(r.points, '-1')).catch(() => onAnswered(0, '-1'))
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-2">
      {/* Stays on screen when a long question pushes the options below the fold. */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-night/90 backdrop-blur flex items-center justify-between">
        <p className="tag">Soal {questionIndex + 1} / {totalQuestions}</p>
        <Timer compact durationMs={Math.max(500, TIMER_MS.bible_quiz - elapsedMs)} onExpire={handleExpire} />
      </div>
      <h2 className="font-display text-xl font-medium leading-snug">{content.question}</h2>

      <div className="grid grid-cols-2 gap-3">
        {content.options.map((opt, i) => {
          const o = OPTIONS[i]
          const dimmed = answered && selected !== i
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={answered}
              className={`p-4 rounded-2xl text-left transition-all cursor-pointer disabled:cursor-default active:translate-y-1 ${o.text} ${
                selected === i ? 'ring-4 ring-white' : ''
              } ${dimmed ? 'opacity-30' : ''}`}
              style={{ background: o.bg, boxShadow: `0 4px 0 ${o.shadow}` }}
            >
              <span className="text-base mr-1.5 align-middle" aria-hidden>{o.shape}</span>
              <span className="text-sm font-bold leading-snug">{opt}</span>
            </button>
          )
        })}
      </div>


      {sendError && !answered && (
        <p role="alert" className="text-rose-300 text-xs font-semibold text-center">
          Jawaban belum terkirim. Periksa koneksi, lalu coba lagi.
        </p>
      )}

      {answered && (
        <div className="flex flex-col items-center gap-1.5">
          {content.reference && (
            <p className="text-mist text-xs font-semibold">📖 {content.reference}</p>
          )}
          <p className="text-center text-faint text-xs font-semibold animate-pulse">Menunggu soal berikutnya...</p>
        </div>
      )}
    </div>
  )
}
