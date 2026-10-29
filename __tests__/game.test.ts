import { describe, it, expect } from 'vitest'
import {
  publicContent, correctAnswerOf, scoreAnswer, effectiveTimeMs, isPastDeadline, shuffle,
  generateRoomCode, TIMER_MS, LATENCY_ALLOWANCE_MS, DEADLINE_GRACE_MS,
  timerMsOf, maxAnswerLength, GAME_TYPES, MAX_ANSWER_LENGTH, MAX_MEMORY_ANSWER_LENGTH,
} from '@/lib/scoring'

const quiz = { question: 'q', options: ['a', 'b', 'c', 'd'], answer_index: 2, reference: 'x' }
const verse = { reference: 'r', words: ['a', 'b', 'c'], correct_order: [2, 0, 1] }
const emoji = { emojis: '🙂', hint: 'h', words: ['a', 'b', 'c', 'd', 'e', 'f'], correct: [0, 1, 2, 3, 4] }

describe('publicContent', () => {
  it('strips every answer field', () => {
    expect(publicContent(quiz)).toEqual({ question: 'q', options: ['a', 'b', 'c', 'd'], reference: 'x' })
    expect(publicContent(verse)).toEqual({ reference: 'r', words: ['a', 'b', 'c'] })
    expect(publicContent(emoji)).toEqual({ emojis: '🙂', hint: 'h', words: ['a', 'b', 'c', 'd', 'e', 'f'] })
  })
  it('does not mutate the original', () => {
    publicContent(quiz)
    expect(quiz.answer_index).toBe(2)
  })
})

describe('correctAnswerOf', () => {
  it('returns the right field per game, including index 0', () => {
    expect(correctAnswerOf('bible_quiz', quiz)).toBe(2)
    expect(correctAnswerOf('bible_quiz', { ...quiz, answer_index: 0 })).toBe(0)
    expect(correctAnswerOf('verse_scramble', verse)).toEqual([2, 0, 1])
    expect(correctAnswerOf('emoji_story', emoji)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('scoreAnswer', () => {
  it('scores bible quiz by correctness and time', () => {
    expect(scoreAnswer('bible_quiz', quiz, '2', 0)).toEqual({ ok: true, isCorrect: true, points: 1000 })
    expect(scoreAnswer('bible_quiz', quiz, '1', 0)).toEqual({ ok: true, isCorrect: false, points: 0 })
    expect(scoreAnswer('bible_quiz', quiz, '-1', 15000)).toMatchObject({ isCorrect: false, points: 0 })
  })

  it('scores verse scramble by words kept in order', () => {
    expect(scoreAnswer('verse_scramble', verse, '[2,0,1]', 0)).toEqual({ ok: true, isCorrect: true, points: 1000 })
    expect(scoreAnswer('verse_scramble', verse, '[2,1,0]', 0)).toMatchObject({ isCorrect: false, points: 667 })
    expect(scoreAnswer('verse_scramble', verse, '[]', 0)).toMatchObject({ points: 0 })
  })

  it('does not let one misplaced word shift the rest, and treats repeated words alike', () => {
    const sentence = {
      words: ['an', 'apple', 'is', 'being', 'eaten', 'by', 'an', 'eagle'],
      correct_order: [0, 1, 2, 3, 4, 5, 6, 7],
    }
    // "apple" moved to the front: 7 of 8 words are still in order.
    expect(scoreAnswer('verse_scramble', sentence, '[1,0,2,3,4,5,6,7]', 0)).toMatchObject({ isCorrect: false, points: 875 })
    // The two "an" swapped: the sentence reads the same, so it is fully correct.
    expect(scoreAnswer('verse_scramble', sentence, '[6,1,2,3,4,5,0,7]', 0)).toEqual({ ok: true, isCorrect: true, points: 1000 })
    // A word dropped at the start used to push everything one slot off.
    expect(scoreAnswer('verse_scramble', sentence, '[1,2,3,4,5,6,7]', 0)).toMatchObject({ points: 875 })
  })

  it('rejects malformed verse answers', () => {
    for (const bad of ['nope', '"x"', '[1.5]', '[0,0]', '[0,1,2,3]', '[-1]', '[9]', '{"a":1}']) {
      expect(scoreAnswer('verse_scramble', verse, bad, 0)).toEqual({ ok: false, error: 'invalid answer format' })
    }
  })

  it('scores emoji story and rejects selecting more than the correct count', () => {
    expect(scoreAnswer('emoji_story', emoji, '[0,1,2,3,4]', 0)).toEqual({ ok: true, isCorrect: true, points: 1000 })
    expect(scoreAnswer('emoji_story', emoji, '[0,1,2,5,4]', 0)).toMatchObject({ points: 700, isCorrect: false })
    expect(scoreAnswer('emoji_story', emoji, '[0,1,2,3,4,5]', 0)).toMatchObject({ ok: false })
    expect(scoreAnswer('emoji_story', emoji, '[0,0,0,0,0]', 0)).toMatchObject({ ok: false })
  })
})

describe('effectiveTimeMs', () => {
  const timer = TIMER_MS.bible_quiz
  it('keeps an honest client time', () => {
    expect(effectiveTimeMs(4000, 4300, timer)).toBe(4000)
  })
  it('raises an impossibly low client time to the server floor', () => {
    expect(effectiveTimeMs(1, 9000, timer)).toBe(9000 - LATENCY_ALLOWANCE_MS)
    expect(effectiveTimeMs(-500, 9000, timer)).toBe(9000 - LATENCY_ALLOWANCE_MS)
  })
  it('never exceeds the timer', () => {
    expect(effectiveTimeMs(99999, 99999, timer)).toBe(timer)
  })
})

describe('isPastDeadline', () => {
  it('allows the grace window', () => {
    const t = TIMER_MS.bible_quiz
    expect(isPastDeadline(t + DEADLINE_GRACE_MS, t)).toBe(false)
    expect(isPastDeadline(t + DEADLINE_GRACE_MS + 1, t)).toBe(true)
  })
})

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffle(input)
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('is uniform enough: each element lands in each slot', () => {
    const counts = [0, 0, 0].map(() => [0, 0, 0])
    for (let n = 0; n < 6000; n++) shuffle([0, 1, 2]).forEach((v, slot) => counts[v][slot]++)
    for (const row of counts) for (const c of row) expect(c).toBeGreaterThan(1700)
  })
})

describe('generateRoomCode', () => {
  it('is 6 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})

describe('memory_match support in the shared rules', () => {
  it('is a known game type with a fallback timer', () => {
    expect(GAME_TYPES).toContain('memory_match')
    expect(TIMER_MS.memory_match).toBe(220_000)
  })
  it('timerMsOf prefers the timer stored in the content, else the per-game default', () => {
    expect(timerMsOf('memory_match', { timerMs: 80_000 })).toBe(80_000)
    expect(timerMsOf('memory_match', {})).toBe(TIMER_MS.memory_match)
    expect(timerMsOf('bible_quiz', { question: 'q' })).toBe(TIMER_MS.bible_quiz)
    expect(timerMsOf('bible_quiz', null)).toBe(TIMER_MS.bible_quiz)
    expect(timerMsOf('memory_match', { timerMs: 0 })).toBe(TIMER_MS.memory_match)
    expect(timerMsOf('memory_match', { timerMs: '9' })).toBe(TIMER_MS.memory_match)
  })
  it('correctAnswerOf returns the right option per pair', () => {
    const content = { quiz: [{ pair: 0, options: ['a', 'b', 'c', 'd'], answer: 2 }, { pair: 1, options: ['a', 'b', 'c', 'd'], answer: 0 }] }
    expect(correctAnswerOf('memory_match', content)).toEqual([2, 0])
    expect(correctAnswerOf('memory_match', {})).toEqual([])
  })
  it('allows longer answers only for memory_match', () => {
    expect(maxAnswerLength('bible_quiz')).toBe(MAX_ANSWER_LENGTH)
    expect(maxAnswerLength('memory_match')).toBe(MAX_MEMORY_ANSWER_LENGTH)
    expect(MAX_MEMORY_ANSWER_LENGTH).toBeGreaterThan(MAX_ANSWER_LENGTH)
  })
  it('scoreAnswer refuses memory (it is scored by scoreMemoryAnswer)', () => {
    expect(scoreAnswer('memory_match', {}, '[]', 0)).toEqual({ ok: false, error: 'invalid answer format' })
  })
})
