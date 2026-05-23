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
  { label: 'A', base: 'bg-red-50 border-red-100', sel: 'bg-red-100 border-red-400' },
  { label: 'B', base: 'bg-blue-50 border-blue-100', sel: 'bg-blue-100 border-blue-400' },
  { label: 'C', base: 'bg-green-50 border-green-100', sel: 'bg-green-100 border-green-400' },
  { label: 'D', base: 'bg-amber-50 border-amber-100', sel: 'bg-amber-100 border-amber-400' },
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
          <p className="tag mb-2">Soal {questionIndex + 1} / {totalQuestions}</p>
          <h2 className="text-[#111] text-lg font-semibold leading-snug">{content.question}</h2>
        </div>
        <Timer durationMs={15000} onExpire={handleExpire} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {content.options.map((opt, i) => {
          const o = OPTIONS[i]
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={answered}
              className={`p-4 rounded-2xl text-left border active:scale-98 transition-all disabled:cursor-default ${
                selected === i ? o.sel : o.base
              }`}
            >
              <span className="text-xs text-[#999] font-semibold mr-1">{o.label}.</span>
              <span className="text-sm font-medium text-[#111] leading-snug">{opt}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="flex flex-col items-center gap-1.5">
          {content.reference && (
            <p className="text-[#999] text-xs">📖 {content.reference}</p>
          )}
          <p className="text-center text-[#CCC] text-xs animate-pulse">Menunggu soal berikutnya...</p>
        </div>
      )}
    </div>
  )
}
