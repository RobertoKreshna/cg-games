'use client'
import { useEffect, useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import { now } from '@/lib/clock'
import { TIMER_MS, shuffle } from '@/lib/scoring'
import type { EmojiStoryContent } from '@/types/game'

interface Props {
  questionId: string
  content: EmojiStoryContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  /** Time already spent on this question, e.g. when the page was refreshed mid-question. */
  elapsedMs?: number
  onAnswered: (points: number, submittedAnswer: string) => void
}

export function EmojiStory({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, elapsedMs = 0, onAnswered }: Props) {
  const [selected, setSelected] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)
  const [sendError, setSendError] = useState(false)
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = now() - elapsedMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [shuffledIndices] = useState<number[]>(() => shuffle(content.words.map((_, i) => i)))

  function toggleWord(index: number) {
    if (answered) return
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index)
      if (prev.length >= 5) return prev
      return [...prev, index]
    })
  }

  async function doSubmit(indices: number[], elapsed: number): Promise<boolean> {
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId,
        submitted_answer: JSON.stringify(indices),
        time_taken_ms: elapsed,
      })
      onAnswered(result.points, JSON.stringify(indices))
      return true
    } catch {
      return false
    }
  }

  async function handleSubmit() {
    if (answered || selected.length !== 5) return
    setAnswered(true)
    setSendError(false)
    if (!(await doSubmit(selected, now() - startRef.current))) {
      // Not recorded by the server: let the player submit again while time remains.
      setAnswered(false)
      setSendError(true)
    }
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    // Time is up, so there is no second chance: show 0 if the answer could not be sent.
    if (!(await doSubmit(selected, TIMER_MS.emoji_story))) onAnswered(0, JSON.stringify(selected))
  }

  const remaining = 5 - selected.length

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-6">
      <div className="flex justify-between w-full items-center">
        <div>
          <p className="tag">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-mist text-sm mt-0.5 font-semibold">
            {answered ? 'Menunggu soal berikutnya...' : remaining > 0 ? `Pilih ${remaining} lagi` : 'Siap submit! 🔥'}
          </p>
        </div>
        <Timer durationMs={Math.max(500, TIMER_MS.emoji_story - elapsedMs)} onExpire={handleExpire} />
      </div>

      <div className="card w-full py-5 flex flex-col items-center gap-1.5">
        <p className="text-5xl tracking-widest leading-relaxed text-center">{content.emojis}</p>
        <p className="text-faint text-xs font-semibold">{content.hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {shuffledIndices.map((origIdx) => {
          const isSelected = selected.includes(origIdx)
          const isFull = selected.length >= 5 && !isSelected
          return (
            <button
              key={origIdx}
              onClick={() => toggleWord(origIdx)}
              disabled={answered || isFull}
              className={`py-3 px-4 rounded-xl text-sm font-bold text-left border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-pick border-pick text-white shadow-[0_3px_0_#1e3a8a]'
                  : 'bg-surface border-line'
              } ${isFull ? 'opacity-25' : ''}`}
            >
              {content.words[origIdx]}
            </button>
          )
        })}
      </div>

      {sendError && !answered && (
        <p role="alert" className="text-rose-300 text-xs font-semibold text-center">
          Jawaban belum terkirim. Periksa koneksi, lalu coba lagi.
        </p>
      )}

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={selected.length !== 5}
          className="btn-primary py-3.5 text-base w-full"
        >
          Submit ({selected.length}/5)
        </button>
      )}
    </div>
  )
}
