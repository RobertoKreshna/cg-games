import { describe, it, expect } from 'vitest'
import {
  buildBoard, replayMemory, scoreMemory, scoreMemoryAnswer, minMemoryTimeMs, memoryTimerMs, memoryCols,
  isMemoryCardCount, isMemoryDelay, MEMORY_CARD_COUNTS, MEMORY_DELAYS_MS,
  type MemoryBoard, type MemoryVerse,
} from '@/lib/memory-rules'

// Small deterministic PRNG so shuffles are repeatable.
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const verses: MemoryVerse[] = Array.from({ length: 40 }, (_, i) => ({
  reference: `Kitab ${i + 1}:${i + 1}`,
  text: `Bunyi ayat nomor ${i + 1} yang cukup panjang`,
}))

/** A flip/answer log that finds every pair; `mistakes` adds deliberate mismatches first. */
function play(board: MemoryBoard, { mistakes = 0, answered = board.quiz.length, correct = true } = {}) {
  const ids = new Map<number, number[]>()
  board.cards.forEach((c) => ids.set(c.pair, [...(ids.get(c.pair) ?? []), c.id]))
  const f: number[] = []
  for (let m = 0; m < mistakes; m++) f.push(ids.get(0)![0], ids.get(1)![0])
  const q: [number, number][] = []
  for (let pair = 0; pair < board.quiz.length; pair++) {
    f.push(...ids.get(pair)!)
    if (pair < answered) {
      const answer = board.quiz.find((x) => x.pair === pair)!.answer
      q.push([pair, correct ? answer : (answer + 1) % 4])
    }
  }
  return { f, q }
}

describe('constants and helpers', () => {
  it('offers the configured sizes and delays', () => {
    expect([...MEMORY_CARD_COUNTS]).toEqual([12, 20, 30, 40])
    expect([...MEMORY_DELAYS_MS]).toEqual([500, 1000, 2000, 3000])
    expect(isMemoryCardCount(20)).toBe(true)
    expect(isMemoryCardCount(18)).toBe(false)
    expect(isMemoryCardCount('20')).toBe(false)
    expect(isMemoryDelay(1000)).toBe(true)
    expect(isMemoryDelay(1500)).toBe(false)
  })
  it('lays out columns and sizes the timer from the card count', () => {
    expect([12, 20, 30, 40].map(memoryCols)).toEqual([3, 4, 5, 5])
    expect(memoryTimerMs(12)).toBe(80_000)
    expect(memoryTimerMs(20)).toBe(120_000)
    expect(memoryTimerMs(40)).toBe(220_000)
  })
})

describe('buildBoard', () => {
  it.each([12, 20, 30, 40])('builds %i cards: every reference appears on exactly two cards', (count) => {
    const board = buildBoard(verses, count, 1000, seeded(count))
    expect(board.cards).toHaveLength(count)
    expect(board.quiz).toHaveLength(count / 2)
    expect(board.cards.map((c) => c.id)).toEqual(Array.from({ length: count }, (_, i) => i))
    const perPair = new Map<number, string[]>()
    board.cards.forEach((c) => perPair.set(c.pair, [...(perPair.get(c.pair) ?? []), c.text]))
    expect(perPair.size).toBe(count / 2)
    for (const texts of perPair.values()) {
      expect(texts).toHaveLength(2)
      expect(texts[0]).toBe(texts[1])
    }
    expect(board.cols).toBe(memoryCols(count))
    expect(board.hideMs).toBe(1000)
    expect(board.timerMs).toBe(memoryTimerMs(count))
  })

  it('never repeats a verse on one board', () => {
    const board = buildBoard(verses, 40, 500, seeded(7))
    const refs = new Set(board.cards.map((c) => c.text))
    expect(refs.size).toBe(20)
  })

  it('gives each pair 4 distinct options, with `answer` pointing at the right verse', () => {
    const board = buildBoard(verses, 20, 1000, seeded(3))
    for (const quiz of board.quiz) {
      const reference = board.cards.find((c) => c.pair === quiz.pair)!.text
      const verse = verses.find((v) => v.reference === reference)!
      expect(quiz.options).toHaveLength(4)
      expect(new Set(quiz.options).size).toBe(4)
      expect(quiz.options[quiz.answer]).toBe(verse.text)
      expect(quiz.options.filter((o) => o === verse.text)).toHaveLength(1)
    }
  })

  it('is deterministic for a given random source and different for another', () => {
    const a = buildBoard(verses, 20, 1000, seeded(1))
    const b = buildBoard(verses, 20, 1000, seeded(1))
    const c = buildBoard(verses, 20, 1000, seeded(2))
    expect(a).toEqual(b)
    expect(a.cards.map((x) => x.text)).not.toEqual(c.cards.map((x) => x.text))
  })

  it('ignores verses that repeat a reference or a text', () => {
    const dupes = [...verses, { reference: verses[0].reference, text: 'other text' }, { reference: 'Zzz 1:1', text: verses[1].text }]
    const board = buildBoard(dupes, 40, 1000, seeded(5))
    expect(new Set(board.cards.map((c) => c.text)).size).toBe(20)
  })

  it('rejects an unsupported size, delay, or a pool that is too small', () => {
    expect(() => buildBoard(verses, 18, 1000)).toThrow(/card count/)
    expect(() => buildBoard(verses, 20, 1500)).toThrow(/delay/)
    expect(() => buildBoard(verses.slice(0, 12), 20, 1000)).toThrow(/enough verses/)
  })
})

describe('replayMemory', () => {
  const board = buildBoard(verses, 12, 1000, seeded(11))
  const pairs = 6

  it('counts a perfect game', () => {
    const r = replayMemory(board, play(board))
    expect(r).toEqual({ ok: true, matched: pairs, mistakes: 0, moves: pairs, answered: pairs, correct: pairs, complete: true, pairs })
  })

  it('counts mistakes, wrong answers and partial answers', () => {
    const r = replayMemory(board, play(board, { mistakes: 3, answered: 4, correct: false }))
    expect(r).toMatchObject({ ok: true, matched: pairs, mistakes: 3, moves: pairs + 3, answered: 4, correct: 0, complete: true })
  })

  it('ignores a trailing flip that has no partner (time ran out mid-move)', () => {
    const log = play(board)
    const partial = { f: [...log.f.slice(0, 4), log.f[4]], q: log.q.slice(0, 2) }
    expect(replayMemory(board, partial)).toMatchObject({ ok: true, matched: 2, moves: 2, complete: false })
  })

  it('accepts an empty log', () => {
    expect(replayMemory(board, { f: [], q: [] })).toMatchObject({ ok: true, matched: 0, moves: 0, complete: false })
  })

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['flips missing', { q: [] }],
    ['answers missing', { f: [] }],
    ['flips not integers', { f: [0, 1.5], q: [] }],
    ['flips not numbers', { f: ['a', 'b'], q: [] }],
    ['card out of range (high)', { f: [0, 99], q: [] }],
    ['card out of range (negative)', { f: [-1, 0], q: [] }],
    ['same card twice in a move', { f: [0, 0], q: [] }],
    ['malformed answer entry', { f: [], q: [[1]] }],
    ['answer for a pair that is not matched', { f: [], q: [[0, 1]] }],
    ['too many flips', { f: Array.from({ length: 12 * 6 + 2 }, (_, i) => i % 2), q: [] }],
  ])('rejects %s', (_label, result) => {
    expect(replayMemory(board, result).ok).toBe(false)
  })

  it('rejects flipping a card that is already matched', () => {
    const log = play(board)
    expect(replayMemory(board, { f: [...log.f.slice(0, 2), log.f[0], log.f[2]], q: [] }).ok).toBe(false)
  })

  it('rejects answering a pair twice and options outside 0..3', () => {
    const log = play(board)
    expect(replayMemory(board, { f: log.f, q: [log.q[0], log.q[0]] }).ok).toBe(false)
    expect(replayMemory(board, { f: log.f, q: [[0, 4]] }).ok).toBe(false)
    expect(replayMemory(board, { f: log.f, q: [[0, -1]] }).ok).toBe(false)
  })
})

describe('scoreMemory', () => {
  const full = { matched: 10, correct: 10, mistakes: 0, pairs: 10 }
  it('gives 1000 for a perfect instant game and 500 at the time limit', () => {
    expect(scoreMemory(full, 0, 120_000)).toBe(1000)
    expect(scoreMemory(full, 120_000, 120_000)).toBe(500)
  })
  it('splits the base 50/50 between finding pairs and answering', () => {
    expect(scoreMemory({ ...full, correct: 0 }, 0, 120_000)).toBe(500)
    expect(scoreMemory({ ...full, matched: 0, correct: 0 }, 0, 120_000)).toBe(0)
  })
  it('matches the worked example: 60s of 120s, 4 mistakes, 8/10 right', () => {
    expect(scoreMemory({ matched: 10, correct: 8, mistakes: 4, pairs: 10 }, 60_000, 120_000)).toBe(595)
  })
  it('never goes below zero and clamps time to the limit', () => {
    expect(scoreMemory({ matched: 1, correct: 0, mistakes: 50, pairs: 10 }, 0, 120_000)).toBe(0)
    expect(scoreMemory(full, 999_999, 120_000)).toBe(500)
  })
  it('computes the minimum plausible time', () => {
    expect(minMemoryTimeMs(10, 10)).toBe(15_000)
    expect(minMemoryTimeMs(0, 0)).toBe(0)
  })
})

describe('scoreMemoryAnswer', () => {
  const board = buildBoard(verses, 12, 1000, seeded(13))
  it('scores a valid perfect result and floors an impossibly fast time', () => {
    const fast = scoreMemoryAnswer(board, JSON.stringify(play(board)), 0)
    // 6 moves + 6 answers => 9000ms floor of 80000: factor 1 - 0.5*0.1125 = 0.94375 => 944
    expect(fast).toEqual({ ok: true, isCorrect: true, points: 944 })
    const honest = scoreMemoryAnswer(board, JSON.stringify(play(board)), 20_000)
    expect(honest).toEqual({ ok: true, isCorrect: true, points: 875 })
  })
  it('marks an incomplete game as not correct but still scores it', () => {
    const log = play(board)
    const r = scoreMemoryAnswer(board, JSON.stringify({ f: log.f.slice(0, 4), q: log.q.slice(0, 2) }), 30_000)
    expect(r).toMatchObject({ ok: true, isCorrect: false })
    expect((r as { points: number }).points).toBeGreaterThan(0)
  })
  it('rejects JSON that is invalid or fails the replay', () => {
    expect(scoreMemoryAnswer(board, 'not json', 0)).toEqual({ ok: false, error: 'invalid answer format' })
    expect(scoreMemoryAnswer(board, JSON.stringify({ f: [0, 99], q: [] }), 0)).toEqual({ ok: false, error: 'invalid answer format' })
  })
})
