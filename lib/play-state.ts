// Player-side game state and how the server's view of the room is merged into it.
import type { BibleQuizContent, EmojiStoryContent, GameType, Standings, TeamInfo, VerseScrambleContent } from '@/types/game'

export type Phase = 'lobby' | 'question' | 'answered' | 'reveal'

/** Why the player can no longer take part: removed by the host, room closed, or token no longer valid. */
export type Ended = 'kicked' | 'closed' | 'invalid'

export interface LobbyPlayer {
  id: string
  name: string
}

export interface ActiveQuestion {
  questionId: string
  gameType: GameType
  content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent
  questionIndex: number
  totalQuestions: number
  /** Time already used when this question was loaded (refresh mid-question). */
  elapsedMs: number
}

export interface GameState {
  phase: Phase
  sessionId: string | null
  question: ActiveQuestion | null
  lastPoints: number | null
  submittedAnswer: string | null
  correctAnswer: unknown
  standings: Standings | null
  team: TeamInfo | null
  lobbyPlayers: LobbyPlayer[]
  ended: Ended | null
}

export const INITIAL: GameState = {
  phase: 'lobby', sessionId: null, question: null, lastPoints: null, submittedAnswer: null, correctAnswer: null,
  standings: null, team: null, lobbyPlayers: [], ended: null,
}

const PHASE_ORDER: Record<Phase, number> = { lobby: 0, question: 1, answered: 2, reveal: 3 }

export interface ServerState {
  phase: Phase | 'finished' | 'closed'
  session_id?: string
  current_question?: {
    question_id: string
    game_type: GameType
    content: ActiveQuestion['content']
    question_index: number
    total_questions: number
  }
  points?: number | null
  submitted_answer?: string | null
  correct_answer?: unknown
  elapsed_ms?: number | null
  standings?: Standings | null
  team?: TeamInfo | null
  players?: LobbyPlayer[]
}

// Merges the server's view into local state. For the same question the local phase never moves
// backwards (a slow response must not undo a reveal that already arrived by broadcast).
export function applyServerState(prev: GameState, data: ServerState): GameState {
  const sessionId = data.session_id ?? prev.sessionId
  const cq = data.current_question
  const team = data.team ?? prev.team
  const lobbyPlayers = data.players ?? prev.lobbyPlayers
  if (data.phase === 'closed') return { ...prev, sessionId, team, lobbyPlayers, ended: 'closed' }
  if (!cq || data.phase === 'finished') return { ...prev, sessionId, team, lobbyPlayers }

  if (prev.question?.questionId === cq.question_id && PHASE_ORDER[prev.phase] > PHASE_ORDER[data.phase as Phase]) {
    return { ...prev, sessionId, team, lobbyPlayers, standings: data.standings ?? prev.standings }
  }
  const sameQuestion = prev.question?.questionId === cq.question_id
  return {
    phase: data.phase as Phase,
    sessionId,
    question: sameQuestion ? prev.question : {
      questionId: cq.question_id,
      gameType: cq.game_type,
      content: cq.content,
      questionIndex: cq.question_index,
      totalQuestions: cq.total_questions,
      elapsedMs: data.elapsed_ms ?? 0,
    },
    team,
    lobbyPlayers,
    ended: prev.ended,
    standings: data.standings ?? (sameQuestion ? prev.standings : null),
    lastPoints: data.points ?? (sameQuestion ? prev.lastPoints : null),
    submittedAnswer: data.submitted_answer ?? (sameQuestion ? prev.submittedAnswer : null),
    correctAnswer: data.correct_answer ?? (sameQuestion ? prev.correctAnswer : null),
  }
}
