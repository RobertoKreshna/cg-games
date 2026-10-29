// Rules for Memory Ayat. Pure TypeScript with no imports so it runs in Deno (edge functions) and in
// Next.js (lib/memory-rules.ts re-exports it), like _shared/game.ts.

export const MEMORY_CARD_COUNTS = [12, 20, 30, 40] as const
export const MEMORY_DELAYS_MS = [500, 1000, 2000, 3000] as const
export const MEMORY_DEFAULT_CARDS = 20
export const MEMORY_DEFAULT_DELAY_MS = 1000

/** Time budget: this much per pair (matching + answering) plus a fixed amount. */
export const MEMORY_MS_PER_PAIR = 10_000
export const MEMORY_BASE_MS = 20_000
export const MEMORY_MISTAKE_PENALTY = 5
/** Mistakes can take away at most this share of the base, so finding pairs always earns something. */
export const MEMORY_MAX_PENALTY_SHARE = 0.5
/** No human can finish faster than this per move / per answered quiz; shorter claimed times are raised. */
export const MEMORY_MIN_MS_PER_MOVE = 500
export const MEMORY_MIN_MS_PER_ANSWER = 1000
/** A result may contain at most this many flips per card (rejects absurdly long logs). */
export const MEMORY_MAX_FLIPS_PER_CARD = 6
export const MEMORY_OPTIONS = 4

export interface MemoryVerse { reference: string; text: string }
export interface MemoryCard { id: number; pair: number; text: string }
export interface MemoryQuiz { pair: number; options: string[]; answer: number }
export interface MemoryBoard {
  cols: number
  hideMs: number
  timerMs: number
  cards: MemoryCard[]
  quiz: MemoryQuiz[]
}
/** What a phone submits: flips in order (two per move) and `[pair, option]` for each answered quiz. */
export interface MemoryResult { f: number[]; q: [number, number][] }

export type MemoryReplay =
  | { ok: true; matched: number; mistakes: number; moves: number; answered: number; correct: number; complete: boolean; pairs: number }
  | { ok: false; error: string }

export type MemoryScore =
  | { ok: true; isCorrect: boolean; points: number }
  | { ok: false; error: string }

const COLS: Record<number, number> = { 12: 3, 20: 4, 30: 5, 40: 5 }

export function isMemoryCardCount(n: unknown): n is 12 | 20 | 30 | 40 {
  return (MEMORY_CARD_COUNTS as readonly unknown[]).includes(n)
}

export function isMemoryDelay(n: unknown): n is 500 | 1000 | 2000 | 3000 {
  return (MEMORY_DELAYS_MS as readonly unknown[]).includes(n)
}

export function memoryCols(cardCount: number): number {
  return COLS[cardCount]
}

export function memoryTimerMs(cardCount: number): number {
  return (cardCount / 2) * MEMORY_MS_PER_PAIR + MEMORY_BASE_MS
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Builds one board: pairs of identical reference cards plus a 4-option quiz per pair. */
export function buildBoard(
  verses: readonly MemoryVerse[],
  cardCount: number,
  hideMs: number,
  random: () => number = Math.random,
): MemoryBoard {
  if (!isMemoryCardCount(cardCount)) throw new Error(`invalid card count: ${cardCount}`)
  if (!isMemoryDelay(hideMs)) throw new Error(`invalid delay: ${hideMs}`)

  // A repeated reference would make a pair ambiguous; a repeated text could appear twice among options.
  const unique: MemoryVerse[] = []
  const seenReference = new Set<string>()
  const seenText = new Set<string>()
  for (const verse of verses) {
    if (seenReference.has(verse.reference) || seenText.has(verse.text)) continue
    seenReference.add(verse.reference)
    seenText.add(verse.text)
    unique.push(verse)
  }

  const pairs = cardCount / 2
  if (unique.length < pairs + MEMORY_OPTIONS - 1) throw new Error('not enough verses for this board')

  const chosen = shuffled(unique, random).slice(0, pairs)
  const quiz: MemoryQuiz[] = chosen.map((verse, pair) => {
    const wrong = shuffled(unique.filter((v) => v.text !== verse.text), random)
      .slice(0, MEMORY_OPTIONS - 1)
      .map((v) => v.text)
    const options = shuffled([verse.text, ...wrong], random)
    return { pair, options, answer: options.indexOf(verse.text) }
  })
  const cards: MemoryCard[] = shuffled(
    chosen.flatMap((verse, pair) => [{ pair, text: verse.reference }, { pair, text: verse.reference }]),
    random,
  ).map((card, id) => ({ id, ...card }))

  return { cols: memoryCols(cardCount), hideMs, timerMs: memoryTimerMs(cardCount), cards, quiz }
}

const isInt = (v: unknown): v is number => Number.isInteger(v)

/** Replays a submitted log against the board and validates it. */
export function replayMemory(board: MemoryBoard, result: unknown): MemoryReplay {
  const bad = (error: string): MemoryReplay => ({ ok: false, error })
  if (typeof result !== 'object' || result === null) return bad('invalid result')
  const { f, q } = result as { f?: unknown; q?: unknown }
  if (!Array.isArray(f) || !f.every(isInt)) return bad('invalid flips')
  if (!Array.isArray(q) || !q.every((e) => Array.isArray(e) && e.length === 2 && isInt(e[0]) && isInt(e[1]))) {
    return bad('invalid answers')
  }

  const cardCount = board.cards.length
  const pairs = board.quiz.length
  if (f.length > cardCount * MEMORY_MAX_FLIPS_PER_CARD) return bad('too many flips')

  const matched = new Set<number>()
  let mistakes = 0
  let moves = 0
  // Flips are read in twos; a trailing unpaired flip (time ran out mid-move) is ignored.
  for (let i = 0; i + 1 < f.length; i += 2) {
    const a = f[i]
    const b = f[i + 1]
    if (a < 0 || a >= cardCount || b < 0 || b >= cardCount) return bad('card out of range')
    if (a === b) return bad('same card twice')
    const pairA = board.cards[a].pair
    const pairB = board.cards[b].pair
    if (matched.has(pairA) || matched.has(pairB)) return bad('card already matched')
    moves++
    if (pairA === pairB) matched.add(pairA)
    else mistakes++
  }

  const answeredPairs = new Set<number>()
  let correct = 0
  for (const [pair, option] of q as [number, number][]) {
    if (!matched.has(pair)) return bad('answer for a pair that is not matched')
    if (answeredPairs.has(pair)) return bad('pair answered twice')
    if (option < 0 || option >= MEMORY_OPTIONS) return bad('option out of range')
    answeredPairs.add(pair)
    if (board.quiz.find((x) => x.pair === pair)?.answer === option) correct++
  }

  return {
    ok: true, matched: matched.size, mistakes, moves, answered: answeredPairs.size, correct,
    complete: matched.size === pairs, pairs,
  }
}

/**
 * Half the base comes from finding pairs, half from right answers. Mistakes cost a few points each
 * (at most half the base); then speed scales what is left from 1.0 to 0.5.
 */
export function scoreMemory(
  r: { matched: number; correct: number; mistakes: number; pairs: number },
  timeMs: number,
  timerMs: number,
): number {
  const base = 500 * (r.matched / r.pairs) + 500 * (r.correct / r.pairs)
  const penalty = Math.min(base * MEMORY_MAX_PENALTY_SHARE, MEMORY_MISTAKE_PENALTY * r.mistakes)
  const used = Math.min(1, Math.max(0, timeMs / timerMs))
  return Math.max(0, Math.round((base - penalty) * (1 - 0.5 * used)))
}

export function minMemoryTimeMs(moves: number, answered: number): number {
  return moves * MEMORY_MIN_MS_PER_MOVE + answered * MEMORY_MIN_MS_PER_ANSWER
}

/** Validates and scores a submitted answer string for a stored board. `timeMs` is the already-trusted time. */
export function scoreMemoryAnswer(content: unknown, submitted: string, timeMs: number): MemoryScore {
  const failure: MemoryScore = { ok: false, error: 'invalid answer format' }
  let parsed: unknown
  try { parsed = JSON.parse(submitted) } catch { return failure }
  const board = content as MemoryBoard
  const replay = replayMemory(board, parsed)
  if (!replay.ok) return failure
  const time = Math.min(board.timerMs, Math.max(timeMs, minMemoryTimeMs(replay.moves, replay.answered)))
  return { ok: true, isCorrect: replay.complete, points: scoreMemory(replay, time, board.timerMs) }
}
