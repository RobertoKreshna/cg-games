import type { PublicQuestion } from '@/types/game'

interface HostQuestionCardProps {
  question: PublicQuestion
  /** The correct answer, once the question is revealed. */
  correctAnswer: unknown
  revealed: boolean
}

const LETTERS = ['A', 'B', 'C', 'D']

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
const objects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []

/** What the host sees about the current question, so they can read it out and discuss the answer. */
export function HostQuestionCard({ question, correctAnswer, revealed }: HostQuestionCardProps) {
  const { gameType, content } = question

  if (gameType === 'bible_quiz') {
    const options = strings(content.options)
    const reference = text(content.reference)
    return (
      <section className="card p-4 flex flex-col gap-3" aria-label="Soal saat ini">
        <h2 className="font-display text-lg font-medium leading-snug">{text(content.question)}</h2>
        <ul className="flex flex-col gap-1.5">
          {options.map((opt, i) => {
            const correct = revealed && correctAnswer === i
            return (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  correct ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200' : 'bg-white/5 border-line text-mist'
                }`}
              >
                <span className="w-4 shrink-0 text-xs font-bold pt-0.5">{LETTERS[i]}</span>
                <span className="flex-1">{opt}</span>
                {correct && <span aria-label="jawaban benar">✓</span>}
              </li>
            )
          })}
        </ul>
        {revealed && reference && <p className="text-mist text-xs font-semibold">📖 {reference}</p>}
      </section>
    )
  }

  if (gameType === 'verse_scramble') {
    const words = strings(content.words)
    const order = numbers(correctAnswer)
    const verse = order.map((i) => words[i]).filter(Boolean).join(' ')
    return (
      <section className="card p-4 flex flex-col gap-2" aria-label="Soal saat ini">
        <p className="tag">Susun ayat</p>
        <h2 className="font-display text-lg font-medium">{text(content.reference)}</h2>
        {revealed && verse
          ? <p className="text-sm font-semibold leading-relaxed text-emerald-200">{verse}</p>
          : <p className="text-mist text-xs font-semibold">{words.length} kata diacak</p>}
      </section>
    )
  }

  if (gameType === 'memory_match') {
    const cards = objects(content.cards)
    const quiz = objects(content.quiz)
    return (
      <section className="card p-4 flex flex-col gap-2" aria-label="Soal saat ini">
        <p className="tag">Memory Ayat</p>
        <h2 className="font-display text-lg font-medium">
          {quiz.length} pasang <span className="text-mist text-sm font-semibold">· {cards.length} kartu</span>
        </h2>
        {!revealed && <p className="text-mist text-xs font-semibold">Pemain mencocokkan kartu, lalu menebak bunyi ayatnya.</p>}
        {revealed && (
          <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {quiz.map((q, i) => {
              const options = strings(q.options)
              const reference = text(cards.find((c) => c.pair === q.pair)?.text)
              return (
                <li key={i} className="rounded-xl bg-white/5 border border-line px-3 py-2 text-sm">
                  <span className="font-bold">{reference}</span>
                  <p className="text-mist text-xs font-semibold leading-snug mt-0.5">{typeof q.answer === 'number' ? options[q.answer] : ''}</p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    )
  }

  const words = strings(content.words)
  const correct = new Set(numbers(correctAnswer))
  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Soal saat ini">
      <p className="tag">Tebak kisahnya</p>
      <p className="text-4xl tracking-widest text-center leading-relaxed">{text(content.emojis)}</p>
      {text(content.hint) && <p className="text-mist text-xs font-semibold text-center">{text(content.hint)}</p>}
      {revealed && correct.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w, i) => correct.has(i) && (
            <span key={i} className="rounded-full bg-emerald-400/15 border border-emerald-400/60 text-emerald-200 px-2.5 py-1 text-xs font-bold">{w}</span>
          ))}
        </div>
      )}
    </section>
  )
}
