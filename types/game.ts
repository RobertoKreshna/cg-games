export type GameType = 'bible_quiz' | 'verse_scramble' | 'emoji_story'
export type RoomMode = 'individual' | 'team'

export interface BibleQuizContent {
  question: string
  options: string[]
  answer_index: number
  reference?: string
}

export interface VerseScrambleContent {
  reference: string
  words: string[]
  correct_order: number[]
}

export interface EmojiStoryContent {
  emojis: string
  hint: string
  words: string[]
  correct: number[]
}

export type QuestionContent = BibleQuizContent | VerseScrambleContent | EmojiStoryContent

export interface LeaderboardEntry {
  playerId?: string
  playerName?: string
  teamId?: string
  teamName?: string
  teamColor?: string
  totalPoints: number
}

export interface StandingEntry {
  /** Player id (individual) or team id (team). */
  id: string
  name: string
  color?: string
  points: number
}

export interface Standings {
  mode: RoomMode
  entries: StandingEntry[]
}

export interface TeamInfo {
  id: string
  name: string
  color: string
}

/** A question as players see it: content without the answer fields. */
export interface PublicQuestion {
  gameType: GameType
  content: Record<string, unknown>
}
