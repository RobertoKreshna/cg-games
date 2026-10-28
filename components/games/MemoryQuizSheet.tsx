'use client'
import { useEffect, useRef } from 'react'

interface MemoryQuizSheetProps {
  reference: string
  options: string[]
  answer: number
  /** The option the player picked; null while still choosing. */
  chosen: number | null
  onChoose: (option: number) => void
  onContinue: () => void
}

/** The multiple choice shown after a pair is found: "what does this verse say?" */
export function MemoryQuizSheet({ reference, options, answer, chosen, onChoose, onContinue }: MemoryQuizSheetProps) {
  const firstRef = useRef<HTMLButtonElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])
  useEffect(() => {
    if (chosen !== null) continueRef.current?.focus()
  }, [chosen])

  const right = chosen !== null && chosen === answer

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-quiz-title"
        className="card w-full max-w-md p-4 flex flex-col gap-3 animate-pop-in max-h-[85dvh] overflow-y-auto"
      >
        <h2 id="memory-quiz-title" className="font-display text-lg font-semibold">
          {reference} <span className="text-mist font-medium">— Apa bunyinya?</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {options.map((text, i) => {
            const isAnswer = chosen !== null && i === answer
            const isWrong = chosen !== null && i === chosen && i !== answer
            return (
              <li key={i}>
                <button
                  ref={i === 0 ? firstRef : undefined}
                  onClick={() => onChoose(i)}
                  disabled={chosen !== null}
                  className={`w-full text-left rounded-xl border px-3 py-3 text-sm font-semibold leading-snug transition-colors disabled:cursor-default ${
                    isAnswer ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200'
                    : isWrong ? 'bg-rose-400/15 border-rose-400/60 text-rose-200'
                    : 'bg-white/5 border-line text-white'
                  } ${chosen !== null && !isAnswer && !isWrong ? 'opacity-50' : ''}`}
                >
                  {text}
                  {isAnswer && <span aria-hidden> ✓</span>}
                  {isWrong && <span aria-hidden> ✗</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {chosen !== null && (
          <div role="status" className="flex items-center justify-between gap-3">
            <p className={`text-sm font-bold ${right ? 'text-emerald-300' : 'text-rose-300'}`}>
              {right ? 'Benar!' : 'Salah — jawaban yang benar ditandai hijau.'}
            </p>
            <button ref={continueRef} onClick={onContinue} className="btn-primary py-2 px-5 text-sm shrink-0">
              Lanjut
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
