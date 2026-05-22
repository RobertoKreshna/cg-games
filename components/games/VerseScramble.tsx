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
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="label-tag">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-gold font-bold text-base mt-0.5">{content.reference}</p>
        </div>
        <Timer durationMs={30000} onExpire={handleExpire} />
      </div>

      <div
        className="min-h-24 p-4 flex flex-wrap gap-2 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {placed.length === 0 ? (
          <p className="text-white/20 text-sm self-center mx-auto italic">Ketuk kata untuk menyusun ayat...</p>
        ) : (
          placed.map((wordIndex, pos) => (
            <button
              key={pos}
              onClick={() => remove(pos)}
              className="bg-amber-500/80 text-black px-3 py-1.5 rounded-lg font-bold text-sm active:scale-95 transition-transform shadow-sm"
            >
              {content.words[wordIndex]}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((wordIndex) => (
          <button
            key={wordIndex}
            onClick={() => tap(wordIndex)}
            disabled={answered}
            className="px-3 py-2 rounded-xl font-semibold text-sm text-white active:scale-95 transition-all disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      {!answered ? (
        <button onClick={handleSubmit} disabled={placed.length === 0} className="btn-primary py-3 text-base w-full">
          Submit ✓
        </button>
      ) : (
        <p className="text-center text-white/30 text-xs animate-pulse">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
