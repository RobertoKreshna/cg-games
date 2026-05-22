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

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b']
const LABELS = ['A', 'B', 'C', 'D']

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
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-4">
          <p className="text-white/60 text-sm mb-1">Soal {questionIndex + 1} / {totalQuestions}</p>
          <h2 className="text-white text-lg font-bold leading-snug">{content.question}</h2>
        </div>
        <Timer durationMs={15000} onExpire={handleExpire} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {content.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={answered}
            style={{ backgroundColor: selected === i ? COLORS[i] : '#ffffff', color: selected === i ? '#fff' : '#1f2937' }}
            className="p-4 rounded-2xl font-semibold text-left shadow-md active:scale-95 transition-all disabled:cursor-default"
          >
            <span className="font-bold mr-2">{LABELS[i]}.</span>{opt}
          </button>
        ))}
      </div>
      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
