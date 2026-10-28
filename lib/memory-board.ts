import type { MemoryBoard, MemoryQuiz, MemoryResult } from '@/lib/memory-rules'

/** Everything the board needs to render and to submit. Pure data; timers live in the component. */
export interface BoardState {
  /** Card ids currently face up and not yet resolved (0 to 2). */
  flipped: number[]
  /** Pair ids already found. */
  matched: number[]
  /** The pair whose multiple choice is open, if any. */
  quizPair: number | null
  /** The option picked in the open quiz; set means "showing feedback". */
  chosen: number | null
  /** [pair, option] for every answered quiz, in order. */
  answers: [number, number][]
  /** Every flip in order (two per move): what the server replays. */
  flips: number[]
  mistakes: number
  /** Two different cards are face up, waiting to be closed. */
  locked: boolean
}

export type BoardAction =
  | { type: 'flip'; id: number }
  | { type: 'hideMismatch' }
  | { type: 'answer'; option: number }
  | { type: 'closeQuiz' }

export const initialBoardState: BoardState = {
  flipped: [], matched: [], quizPair: null, chosen: null, answers: [], flips: [], mistakes: 0, locked: false,
}

export function quizFor(board: MemoryBoard, pair: number): MemoryQuiz | undefined {
  return board.quiz.find((q) => q.pair === pair)
}

/** The reducer for one board. Invalid actions return the same state object (so they cause no re-render). */
export function makeBoardReducer(board: MemoryBoard) {
  return (state: BoardState, action: BoardAction): BoardState => {
    switch (action.type) {
      case 'flip': {
        const card = board.cards[action.id]
        if (!card || state.locked || state.quizPair !== null) return state
        if (state.matched.includes(card.pair) || state.flipped.includes(action.id)) return state
        const flips = [...state.flips, action.id]
        if (state.flipped.length === 0) return { ...state, flipped: [action.id], flips }
        const first = board.cards[state.flipped[0]]
        if (first.pair === card.pair) {
          return { ...state, flipped: [], matched: [...state.matched, card.pair], quizPair: card.pair, flips }
        }
        return { ...state, flipped: [state.flipped[0], action.id], mistakes: state.mistakes + 1, locked: true, flips }
      }
      case 'hideMismatch':
        return state.locked ? { ...state, flipped: [], locked: false } : state
      case 'answer': {
        if (state.quizPair === null || state.chosen !== null) return state
        const quiz = quizFor(board, state.quizPair)
        if (!quiz || !Number.isInteger(action.option) || action.option < 0 || action.option >= quiz.options.length) return state
        return { ...state, chosen: action.option, answers: [...state.answers, [state.quizPair, action.option]] }
      }
      case 'closeQuiz':
        return state.chosen === null ? state : { ...state, quizPair: null, chosen: null }
    }
  }
}

/** Every pair found and every quiz answered. */
export function isBoardFinished(board: MemoryBoard, state: BoardState): boolean {
  return state.matched.length === board.quiz.length && state.answers.length === board.quiz.length
}

export function toResult(state: BoardState): MemoryResult {
  return { f: state.flips, q: state.answers }
}
