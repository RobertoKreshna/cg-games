import type { MemoryBoard } from '@/lib/memory-rules'

/** pair → chosen option, read defensively from the string a player submitted. */
export function parseMemoryAnswers(submitted: string | null | undefined): Map<number, number> {
  const answers = new Map<number, number>()
  if (!submitted) return answers
  try {
    const q = (JSON.parse(submitted) as { q?: unknown }).q
    if (!Array.isArray(q)) return answers
    for (const entry of q) {
      if (Array.isArray(entry) && entry.length === 2 && Number.isInteger(entry[0]) && Number.isInteger(entry[1])) {
        answers.set(entry[0], entry[1])
      }
    }
  } catch {
    // not JSON: nothing to show
  }
  return answers
}

interface MemoryRecapProps {
  board: MemoryBoard
  /** The player's own submitted result. `undefined` = no player (host view): list verses without marks. */
  submitted: string | null | undefined
}

/** Every verse on the board with its text and, for a player, whether they got it right. */
export function MemoryRecap({ board, submitted }: MemoryRecapProps) {
  const answers = parseMemoryAnswers(submitted)
  const showMarks = submitted !== undefined

  return (
    <section aria-label="Rekap ayat" className="w-full max-w-xs flex flex-col gap-1.5">
      <p className="tag">Rekap ayat</p>
      <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {board.quiz.map((quiz) => {
          const reference = board.cards.find((c) => c.pair === quiz.pair)?.text ?? ''
          const chosen = answers.get(quiz.pair)
          const mark = chosen === undefined ? 'belum dijawab' : chosen === quiz.answer ? 'benar' : 'salah'
          return (
            <li key={quiz.pair} className="rounded-xl bg-white/5 border border-line px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{reference}</span>
                {showMarks && (
                  <span
                    aria-label={mark}
                    className={mark === 'benar' ? 'text-emerald-300' : mark === 'salah' ? 'text-rose-300' : 'text-faint'}
                  >
                    {mark === 'benar' ? '✓' : mark === 'salah' ? '✗' : '–'}
                  </span>
                )}
              </div>
              <p className="text-mist text-xs font-semibold leading-snug mt-0.5">{quiz.options[quiz.answer]}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
