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
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto w-full flex-1 items-center">
      <div className="flex justify-between w-full items-center">
        <p className="text-white/60 text-sm">Soal {questionIndex + 1} / {totalQuestions} — Tebak kisahnya!</p>
        <Timer durationMs={20000} onExpire={handleExpire} />
      </div>

      <p className="text-7xl tracking-widest text-center py-4">{content.emojis}</p>
      <p className="text-white/50 text-xs">Hint: {content.hint}</p>

      <input
        className="w-full bg-white/20 border-2 border-white/30 text-white placeholder:text-white/40 rounded-xl p-3 text-center text-lg focus:outline-none focus:border-white"
        placeholder="Jawaban kamu..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={answered}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
      />

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim()}
          className="bg-white text-blue-700 font-bold py-3 px-10 rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
        >
          Submit
        </button>
      )}
      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu reveal...</p>
      )}
    </div>
  )
}
