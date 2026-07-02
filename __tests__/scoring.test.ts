import { describe, it, expect } from 'vitest'
import {
  calcBibleQuizPoints,
  calcVerseScramblePoints,
  calcEmojiStoryPoints,
} from '@/lib/scoring'

describe('calcBibleQuizPoints', () => {
  it('returns 1000 for instant answer', () => {
    expect(calcBibleQuizPoints(0)).toBe(1000)
  })
  it('returns 0 at time limit', () => {
    expect(calcBibleQuizPoints(15000)).toBe(0)
  })
  it('returns ~500 at halfway', () => {
    expect(calcBibleQuizPoints(7500)).toBe(500)
  })
  it('never goes negative', () => {
    expect(calcBibleQuizPoints(99999)).toBe(0)
  })
})

describe('calcVerseScramblePoints', () => {
  it('returns 1000 for all-correct instant', () => {
    expect(calcVerseScramblePoints(5, 5, 0)).toBe(1000)
  })
  it('returns 500 for all-correct at time limit', () => {
    expect(calcVerseScramblePoints(5, 5, 30000)).toBe(500)
  })
  it('returns 0 for no correct words', () => {
    expect(calcVerseScramblePoints(0, 5, 0)).toBe(0)
  })
  it('never goes negative', () => {
    expect(calcVerseScramblePoints(0, 5, 99999)).toBe(0)
  })
  it('scales by accuracy', () => {
    expect(calcVerseScramblePoints(3, 5, 0)).toBe(600)
  })
})

describe('calcEmojiStoryPoints', () => {
  it('returns 1000 for all 5 correct words selected', () => {
    expect(calcEmojiStoryPoints([0, 1, 2, 3, 4], [0, 1, 2, 3, 4])).toBe(1000)
  })
  it('returns 600 for 3 of 5 correct words selected', () => {
    expect(calcEmojiStoryPoints([0, 1, 2, 5, 6], [0, 1, 2, 3, 4])).toBe(600)
  })
  it('returns 200 for 1 of 5 correct words selected', () => {
    expect(calcEmojiStoryPoints([0, 5, 6, 7, 8], [0, 1, 2, 3, 4])).toBe(200)
  })
  it('returns 0 for no correct words selected', () => {
    expect(calcEmojiStoryPoints([5, 6, 7, 8, 9], [0, 1, 2, 3, 4])).toBe(0)
  })
  it('returns 0 for empty selection', () => {
    expect(calcEmojiStoryPoints([], [0, 1, 2, 3, 4])).toBe(0)
  })
})
