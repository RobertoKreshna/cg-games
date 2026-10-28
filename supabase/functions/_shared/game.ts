// Single source of truth for game rules. Pure TypeScript with no imports so it can run in both
// Deno (edge functions) and Next.js (lib/scoring.ts re-exports it).

export type GameType = 'bible_quiz' | 'verse_scramble' | 'emoji_story' | 'memory_match'

export const GAME_TYPES: GameType[] = ['bible_quiz', 'verse_scramble', 'emoji_story', 'memory_match']
export const ROOM_MODES = ['individual', 'team'] as const

export const TIMER_MS: Record<GameType, number> = {
  bible_quiz: 15000,
  verse_scramble: 30000,
  emoji_story: 20000,
  // Fallback only (largest board): a memory board stores its own `timerMs`, see timerMsOf.
  memory_match: 220000,
}

/** The timer for a question: the one stored in its content if any (memory boards), else the game default. */
export function timerMsOf(gameType: GameType, content: unknown): number {
  const stored = (content as { timerMs?: unknown } | null)?.timerMs
  return typeof stored === 'number' && stored > 0 ? stored : TIMER_MS[gameType]
}

export const MAX_ANSWER_LENGTH = 500
export const MAX_MEMORY_ANSWER_LENGTH = 2000

export function maxAnswerLength(gameType: GameType): number {
  return gameType === 'memory_match' ? MAX_MEMORY_ANSWER_LENGTH : MAX_ANSWER_LENGTH
}

export const MAX_PLAYERS_PER_ROOM = 30
export const MAX_NAME_LENGTH = 30
export const MAX_QUESTION_COUNT = 30
export const MIN_TEAMS = 2
export const MAX_TEAMS = 5

// The server clock starts before the player's phone receives the question. Anything under this
// gap is treated as network delay; a client claiming to be faster than that is ignored.
export const LATENCY_ALLOWANCE_MS = 1500
// Answers arriving later than the timer plus this grace score zero.
export const DEADLINE_GRACE_MS = 3000

export function calcBibleQuizPoints(timeMs: number, timerMs = TIMER_MS.bible_quiz): number {
  return Math.max(0, Math.round(1000 - (timeMs / timerMs) * 1000))
}

export function calcVerseScramblePoints(
  correctWords: number,
  totalWords: number,
  timeMs: number,
  timerMs = TIMER_MS.verse_scramble,
): number {
  const accuracy = correctWords / totalWords
  const speedMultiplier = 1.0 - (timeMs / timerMs) * 0.5
  return Math.max(0, Math.round(accuracy * 1000 * speedMultiplier))
}

// Base score is the share of correct words; each wrong pick then removes 10% of the maximum.
export const EMOJI_WRONG_PENALTY = 100

export function calcEmojiStoryPoints(selected: number[], correct: number[]): number {
  const correctCount = selected.filter((i) => correct.includes(i)).length
  const wrongCount = selected.length - correctCount
  const base = (correctCount / correct.length) * 1000
  return Math.max(0, Math.round(base - wrongCount * EMOJI_WRONG_PENALTY))
}

/**
 * Time used for scoring. Honest clients report a time slightly lower than the server's (network
 * delay), so their value is kept. A client reporting an impossibly low time is raised to the
 * server's measurement minus the latency allowance.
 */
export function effectiveTimeMs(clientMs: number, serverElapsedMs: number, timerMs: number): number {
  const floor = Math.max(0, serverElapsedMs - LATENCY_ALLOWANCE_MS)
  return Math.min(timerMs, Math.max(0, clientMs, floor))
}

export function isPastDeadline(serverElapsedMs: number, timerMs: number): boolean {
  return serverElapsedMs > timerMs + DEADLINE_GRACE_MS
}

type Content = Record<string, unknown>

/** Question content that is safe to send to players: the answer fields are removed. */
export function publicContent(content: unknown): Content {
  const rest = { ...(content as Content) }
  delete rest.answer_index
  delete rest.correct_order
  delete rest.correct
  return rest
}

/** The correct answer, sent to players only once the question is revealed. */
export function correctAnswerOf(gameType: GameType, content: unknown): unknown {
  const c = content as Content
  if (gameType === 'bible_quiz') return c.answer_index
  if (gameType === 'verse_scramble') return c.correct_order
  if (gameType === 'memory_match') {
    return Array.isArray(c.quiz) ? (c.quiz as { answer: number }[]).map((q) => q.answer) : []
  }
  return c.correct
}

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => Number.isInteger(n))
}

export type ScoreResult =
  | { ok: true; isCorrect: boolean; points: number }
  | { ok: false; error: string }

/** Validates a submitted answer against the question and scores it. */
export function scoreAnswer(
  gameType: GameType,
  content: unknown,
  submitted: string,
  timeMs: number,
): ScoreResult {
  const c = content as Content
  const bad: ScoreResult = { ok: false, error: 'invalid answer format' }

  // Memory boards are scored by scoreMemoryAnswer (see _shared/memory.ts).
  if (gameType === 'memory_match') return bad

  if (gameType === 'bible_quiz') {
    const isCorrect = submitted === String(c.answer_index)
    return { ok: true, isCorrect, points: isCorrect ? calcBibleQuizPoints(timeMs) : 0 }
  }

  let parsed: unknown
  try { parsed = JSON.parse(submitted) } catch { return bad }
  if (!isIntArray(parsed)) return bad
  if (new Set(parsed).size !== parsed.length) return bad

  if (gameType === 'verse_scramble') {
    const correctOrder = c.correct_order as number[]
    const words = c.words as string[]
    if (parsed.length > words.length || parsed.some((i) => i < 0 || i >= words.length)) return bad
    const correctWords = correctOrder.filter((v, i) => v === parsed[i]).length
    return {
      ok: true,
      isCorrect: correctWords === correctOrder.length,
      points: calcVerseScramblePoints(correctWords, correctOrder.length, timeMs),
    }
  }

  if (gameType === 'emoji_story') {
    const correct = c.correct as number[]
    const words = c.words as string[]
    // Players pick at most as many words as there are correct ones; anything more is "select all".
    if (parsed.length > correct.length || parsed.some((i) => i < 0 || i >= words.length)) return bad
    const points = calcEmojiStoryPoints(parsed, correct)
    const isCorrect = parsed.length === correct.length && parsed.every((i) => correct.includes(i))
    return { ok: true, isCorrect, points }
  }

  return bad
}

/** Fisher-Yates. The input is not modified. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// No 0/O/1/I so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
