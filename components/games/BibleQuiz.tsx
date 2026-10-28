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
  onAnswered: (points: number, submittedAnswer: string) => void
}

const OPTIONS = [
  { label: 'A', shape: '▲', bg: '#E11D48', shadow: '#9F1239', text: 'text-white' },
  { label: 'B', shape: '◆', bg: '#2563EB', shadow: '#1E3A8A', text: 'text-white' },
  { label: 'C', shape: '●', bg: '#FFC700', shadow: '#B78F00', text: 'text-[#3B2F00]' },
  { label: 'D', shape: '■', bg: '#16A34A', shadow: '#14532D', text: 'text-white' },
]

export function BibleQuiz({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = now()
  }, [])

  async function doSubmit(index: number, elapsed: number) {
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId,
        submitted_answer: String(index),
        time_taken_ms: elapsed,
      })
      onAnswered(result.points, String(index))
    } catch {
      onAnswered(0, String(index))
    }
  }

  async function handleSelect(index: number) {
    if (answered) return
    setSelected(index)
    setAnswered(true)
    await doSubmit(index, now() - startRef.current)
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
    <div className="flex flex-col gap-5 p-4 max-w-lg mx-auto w-full flex-1 pt-6">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <p className="tag mb-2">Soal {questionIndex + 1} / {totalQuestions}</p>
          <h2 className="font-display text-xl font-medium leading-snug">{content.question}</h2>
        </div>
        <Timer durationMs={TIMER_MS.bible_quiz} onExpire={handleExpire} />
      </div>

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
