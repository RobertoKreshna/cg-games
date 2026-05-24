'use client'
import { useMemo, useRef, useState } from 'react'
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
  onAnswered: (points: number, submittedAnswer: string) => void
}

export function EmojiStory({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [selected, setSelected] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())
  const shuffledIndices = useMemo(() => {
    const arr = content.words.map((_, i) => i)
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [content.words.length])

  function toggleWord(index: number) {
    if (answered) return
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index)
      if (prev.length >= 5) return prev
      return [...prev, index]
    })
  }

  async function doSubmit(indices: number[], elapsed: number) {
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: JSON.stringify(indices),
      time_taken_ms: elapsed,
    })
    onAnswered(result.points, JSON.stringify(indices))
  }

  async function handleSubmit() {
    if (answered || selected.length !== 5) return
    setAnswered(true)
    await doSubmit(selected, Date.now() - startRef.current)
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    await doSubmit(selected, 20000)
  }

  const remaining = 5 - selected.length

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-6">
      <div className="flex justify-between w-full items-center">
        <div>
          <p className="tag">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-[#999] text-sm mt-0.5">
            {answered ? 'Menunggu soal berikutnya...' : remaining > 0 ? `Pilih ${remaining} lagi` : 'Siap submit!'}
          </p>
        </div>
        <Timer durationMs={20000} onExpire={handleExpire} />
      </div>

      <div className="bg-white border border-[#E8E8E8] rounded-2xl w-full py-5 flex flex-col items-center gap-1.5">
        <p className="text-5xl tracking-widest leading-relaxed text-center">{content.emojis}</p>
        <p className="text-[#CCC] text-xs">{content.hint}</p>
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
              className={`py-3 px-4 rounded-xl text-sm font-medium text-left border transition-all ${
                isSelected
                  ? 'bg-[#111] text-white border-[#111]'
                  : 'bg-white text-[#111] border-[#E8E8E8]'
              } ${isFull ? 'opacity-25' : ''}`}
            >
              {content.words[origIdx]}
            </button>
          )
        })}
      </div>

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
