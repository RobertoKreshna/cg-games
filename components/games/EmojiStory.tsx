'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { EmojiStoryContent } from '@/types/game'

interface Props {
  questionId: string
  content: EmojiStoryContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

export function EmojiStory({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [answer, setAnswer] = useState('')
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  async function doSubmit(text: string, elapsed: number) {
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: text,
      time_taken_ms: elapsed,
    })
    onAnswered(result.points)
  }

  async function handleSubmit() {
    if (answered || !answer.trim()) return
    setAnswered(true)
    await doSubmit(answer.trim(), Date.now() - startRef.current)
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    await doSubmit(answer.trim() || '', 20000)
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-lg mx-auto w-full flex-1 items-center pt-6">
      <div className="flex justify-between w-full items-center">
        <div>
          <p className="tag">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-[#999] text-sm mt-0.5">Tebak kisahnya!</p>
        </div>
        <Timer durationMs={20000} onExpire={handleExpire} />
      </div>

      <div className="bg-white border border-[#E8E8E8] rounded-2xl w-full py-8 flex flex-col items-center gap-3">
        <p className="text-6xl tracking-widest leading-relaxed text-center">{content.emojis}</p>
        <p className="text-[#CCC] text-xs">Hint: {content.hint}</p>
      </div>

      <input
        className="field-input p-4 text-center text-base font-medium w-full"
        placeholder="Jawaban kamu..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={answered}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
      />

      {!answered ? (
        <button onClick={handleSubmit} disabled={!answer.trim()} className="btn-primary py-3 px-12 text-base">
          Submit
        </button>
      ) : (
        <p className="text-center text-[#CCC] text-xs animate-pulse">Menunggu reveal...</p>
      )}
    </div>
  )
}
