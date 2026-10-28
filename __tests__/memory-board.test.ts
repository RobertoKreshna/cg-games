import { describe, it, expect } from 'vitest'
import { makeBoardReducer, initialBoardState, isBoardFinished, toResult, quizFor, type BoardState } from '@/lib/memory-board'
import type { MemoryBoard } from '@/lib/memory-rules'

// 4 cards: ids 0,2 are pair 0; ids 1,3 are pair 1.
const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 30_000,
  cards: [
    { id: 0, pair: 0, text: 'A 1:1' }, { id: 1, pair: 1, text: 'B 2:2' },
    { id: 2, pair: 0, text: 'A 1:1' }, { id: 3, pair: 1, text: 'B 2:2' },
  ],
  quiz: [
    { pair: 0, options: ['w', 'x', 'y', 'z'], answer: 2 },
    { pair: 1, options: ['w', 'x', 'y', 'z'], answer: 0 },
  ],
}
const reduce = makeBoardReducer(board)
const run = (actions: Parameters<typeof reduce>[1][], from: BoardState = initialBoardState) => actions.reduce(reduce, from)

describe('flipping cards', () => {
  it('the first flip opens one card', () => {
    const s = run([{ type: 'flip', id: 0 }])
    expect(s.flipped).toEqual([0])
    expect(s.flips).toEqual([0])
    expect(s.locked).toBe(false)
  })

  it('two matching cards stay matched and open the quiz for that pair', () => {
    const s = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])
    expect(s.matched).toEqual([0])
    expect(s.flipped).toEqual([])
    expect(s.quizPair).toBe(0)
    expect(s.mistakes).toBe(0)
    expect(s.flips).toEqual([0, 2])
  })

  it('two different cards lock the board and count a mistake', () => {
    const s = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 1 }])
    expect(s.flipped).toEqual([0, 1])
    expect(s.locked).toBe(true)
    expect(s.mistakes).toBe(1)
    expect(s.matched).toEqual([])
  })

  it('ignores taps while locked, and closes the mismatch on hideMismatch', () => {
    const locked = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 1 }])
    expect(reduce(locked, { type: 'flip', id: 2 })).toBe(locked)
    const closed = reduce(locked, { type: 'hideMismatch' })
    expect(closed.flipped).toEqual([])
    expect(closed.locked).toBe(false)
    expect(closed.flips).toEqual([0, 1]) // the log keeps the failed move
  })

  it('hideMismatch does nothing when not locked', () => {
    const s = run([{ type: 'flip', id: 0 }])
    expect(reduce(s, { type: 'hideMismatch' })).toBe(s)
  })

  it('ignores the same card twice, a matched card, and an unknown card', () => {
    const one = run([{ type: 'flip', id: 0 }])
    expect(reduce(one, { type: 'flip', id: 0 })).toBe(one)
    const matched = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }, { type: 'answer', option: 2 }, { type: 'closeQuiz' }])
    expect(reduce(matched, { type: 'flip', id: 0 })).toBe(matched)
    expect(reduce(matched, { type: 'flip', id: 2 })).toBe(matched)
    expect(reduce(initialBoardState, { type: 'flip', id: 99 })).toBe(initialBoardState)
  })

  it('ignores taps while the quiz is open', () => {
    const quiz = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])
    expect(reduce(quiz, { type: 'flip', id: 1 })).toBe(quiz)
  })
})

describe('the multiple choice', () => {
  const asked = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])

  it('records the chosen option once and ignores a second choice', () => {
    const answered = reduce(asked, { type: 'answer', option: 2 })
    expect(answered.chosen).toBe(2)
    expect(answered.answers).toEqual([[0, 2]])
    expect(reduce(answered, { type: 'answer', option: 1 })).toBe(answered)
  })

  it('ignores an answer when no quiz is open, or an option out of range', () => {
    expect(reduce(initialBoardState, { type: 'answer', option: 0 })).toBe(initialBoardState)
    expect(reduce(asked, { type: 'answer', option: 4 })).toBe(asked)
    expect(reduce(asked, { type: 'answer', option: -1 })).toBe(asked)
  })

  it('cannot be closed before an answer is chosen', () => {
    expect(reduce(asked, { type: 'closeQuiz' })).toBe(asked)
  })

  it('closing after an answer frees the board', () => {
    const closed = run([{ type: 'answer', option: 1 }, { type: 'closeQuiz' }], asked)
    expect(closed.quizPair).toBeNull()
    expect(closed.chosen).toBeNull()
    expect(closed.answers).toEqual([[0, 1]])
  })
})

describe('finishing and submitting', () => {
  const finished = run([
    { type: 'flip', id: 0 }, { type: 'flip', id: 1 }, { type: 'hideMismatch' },
    { type: 'flip', id: 0 }, { type: 'flip', id: 2 }, { type: 'answer', option: 2 }, { type: 'closeQuiz' },
    { type: 'flip', id: 1 }, { type: 'flip', id: 3 }, { type: 'answer', option: 3 },
  ])

  it('is finished only when every pair is matched and answered', () => {
    expect(isBoardFinished(board, initialBoardState)).toBe(false)
    expect(isBoardFinished(board, run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }]))).toBe(false) // matched, not answered
    expect(isBoardFinished(board, finished)).toBe(true)
  })

  it('turns the state into the log the server replays', () => {
    expect(toResult(finished)).toEqual({ f: [0, 1, 0, 2, 1, 3], q: [[0, 2], [1, 3]] })
  })

  it('finds the quiz for a pair', () => {
    expect(quizFor(board, 1)?.answer).toBe(0)
    expect(quizFor(board, 9)).toBeUndefined()
  })
})

// The phone's reducer and the server's replay must agree on the log format.
import { buildBoard, replayMemory, scoreMemoryAnswer, type MemoryVerse } from '@/lib/memory-rules'

describe('client log is accepted by the server rules', () => {
  const verses: MemoryVerse[] = Array.from({ length: 30 }, (_, i) => ({ reference: `Kitab ${i + 1}:${i + 1}`, text: `Ayat ${i + 1} berbunyi begini` }))

  /** Plays a whole board through the reducer: some deliberate mismatches, then every pair, answering as told. */
  function playThrough(size: 12 | 20 | 30 | 40, { mismatches, rightAnswers }: { mismatches: number; rightAnswers: boolean }) {
    const real = buildBoard(verses, size, 500, () => 0.37)
    const step = makeBoardReducer(real)
    let state: BoardState = initialBoardState
    const idsOf = (pair: number) => real.cards.filter((c) => c.pair === pair).map((c) => c.id)
    for (let m = 0; m < mismatches; m++) {
      state = step(state, { type: 'flip', id: idsOf(0)[0] })
      state = step(state, { type: 'flip', id: idsOf(1)[0] })
      state = step(state, { type: 'hideMismatch' })
    }
    for (const quiz of real.quiz) {
      const [a, b] = idsOf(quiz.pair)
      state = step(state, { type: 'flip', id: a })
      state = step(state, { type: 'flip', id: b })
      state = step(state, { type: 'answer', option: rightAnswers ? quiz.answer : (quiz.answer + 1) % 4 })
      state = step(state, { type: 'closeQuiz' })
    }
    return { real, state }
  }

  it.each([12, 20, 30, 40] as const)('a perfect %i-card game is complete and fully correct', (size) => {
    const { real, state } = playThrough(size, { mismatches: 0, rightAnswers: true })
    expect(isBoardFinished(real, state)).toBe(true)
    expect(replayMemory(real, toResult(state))).toEqual({
      ok: true, matched: size / 2, mistakes: 0, moves: size / 2, answered: size / 2, correct: size / 2, complete: true, pairs: size / 2,
    })
    expect(scoreMemoryAnswer(real, JSON.stringify(toResult(state)), 30_000)).toMatchObject({ ok: true, isCorrect: true })
  })

  it('mistakes and wrong answers the phone counted are the ones the server counts', () => {
    const { real, state } = playThrough(20, { mismatches: 3, rightAnswers: false })
    expect(state.mistakes).toBe(3)
    expect(replayMemory(real, toResult(state))).toMatchObject({ ok: true, mistakes: 3, correct: 0, matched: 10, complete: true })
  })

  it('a log cut off mid-game (time ran out) is still valid', () => {
    const { real } = playThrough(12, { mismatches: 0, rightAnswers: true })
    const step = makeBoardReducer(real)
    const [a, b] = real.cards.filter((c) => c.pair === 0).map((c) => c.id)
    const [c] = real.cards.filter((x) => x.pair === 1).map((x) => x.id)
    let state: BoardState = initialBoardState
    for (const action of [
      { type: 'flip', id: a }, { type: 'flip', id: b }, { type: 'answer', option: 0 }, { type: 'closeQuiz' }, { type: 'flip', id: c },
    ] as const) state = step(state, action)
    expect(replayMemory(real, toResult(state))).toMatchObject({ ok: true, matched: 1, answered: 1, complete: false })
  })
})
