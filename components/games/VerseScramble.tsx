'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { VerseScrambleContent } from '@/types/game'

interface Props {
  questionId: string
  content: VerseScrambleContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

export function VerseScramble({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [placed, setPlaced] = useState<number[]>([])
  const [available, setAvailable] = useState<number[]>(() => content.words.map((_, i) => i))
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  function tap(wordIndex: number) {
    if (answered) return
    setAvailable((p) => p.filter((i) => i !== wordIndex))
    setPlaced((p) => [...p, wordIndex])
  }

  function remove(pos: number) {
    if (answered) return
    const wordIndex = placed[pos]
    setPlaced((p) => p.filter((_, i) => i !== pos))
    setAvailable((p) => [...p, wordIndex])
  }

  async function doSubmit(indices: number[], elapsed: number) {
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: JSON.stringify(indices),
      time_taken_ms: elapsed,
    })
    onAnswered(result.points)
  }

  async function handleSubmit() {
    if (answered) return
    setAnswered(true)
    await doSubmit(placed, Date.now() - startRef.current)
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    await doSubmit(placed, 30000)
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-white/60 text-sm">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-white font-semibold">{content.reference}</p>
        </div>
        <Timer durationMs={30000} onExpire={handleExpire} />
      </div>

      <div className="min-h-20 bg-white/10 rounded-2xl p-3 flex flex-wrap gap-2 border-2 border-white/20">
        {placed.length === 0 && (
          <p className="text-white/40 text-sm self-center mx-auto">Ketuk kata di bawah untuk menyusun ayat</p>
        )}
        {placed.map((wordIndex, pos) => (
          <button
            key={pos}
            onClick={() => remove(pos)}
            className="bg-white text-gray-800 px-3 py-1 rounded-lg font-medium shadow text-sm active:scale-95"
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((wordIndex) => (
          <button
            key={wordIndex}
            onClick={() => tap(wordIndex)}
            disabled={answered}
            className="bg-blue-500 text-white px-3 py-2 rounded-xl font-medium active:scale-95 transition-transform disabled:opacity-40"
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={placed.length === 0}
          className="bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 active:scale-95"
        >
          Submit
        </button>
      )}
      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
