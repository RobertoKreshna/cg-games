'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { BibleQuizContent } from '@/types/game'

interface Props {
  questionId: string
  content: BibleQuizContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

const OPTIONS = [
  { label: 'A', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)', selBg: 'rgba(239,68,68,0.5)', selBorder: 'rgba(239,68,68,0.8)' },
  { label: 'B', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.35)', selBg: 'rgba(59,130,246,0.5)', selBorder: 'rgba(59,130,246,0.8)' },
  { label: 'C', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.35)', selBg: 'rgba(34,197,94,0.5)', selBorder: 'rgba(34,197,94,0.8)' },
  { label: 'D', bg: 'rgba(245,184,0,0.15)', border: 'rgba(245,184,0,0.35)', selBg: 'rgba(245,184,0,0.5)', selBorder: 'rgba(245,184,0,0.8)' },
]

export function BibleQuiz({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  async function handleSelect(index: number) {
    if (answered) return
    setSelected(index)
    setAnswered(true)
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: String(index),
      time_taken_ms: Date.now() - startRef.current,
    })
    onAnswered(result.points)
  }

  function handleExpire() {
    if (answered) return
    setAnswered(true)
    submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: '-1',
      time_taken_ms: 15000,
    }).then((r) => onAnswered(r.points))
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-lg mx-auto w-full flex-1 pt-6">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <p className="label-tag mb-2">Soal {questionIndex + 1} / {totalQuestions}</p>
          <h2 className="text-white text-lg font-bold leading-snug">{content.question}</h2>
        </div>
        <Timer durationMs={15000} onExpire={handleExpire} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {content.options.map((opt, i) => {
          const o = OPTIONS[i]
          const sel = selected === i
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={answered}
              className="p-4 rounded-2xl text-left text-white active:scale-95 transition-all disabled:cursor-default"
              style={{
                background: sel ? o.selBg : o.bg,
                border: `1px solid ${sel ? o.selBorder : o.border}`,
              }}
            >
              <span className="text-xs opacity-50 font-bold mr-1">{o.label}.</span>
              <span className="text-sm font-semibold leading-snug">{opt}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <p className="text-center text-white/30 text-xs animate-pulse mt-1">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
