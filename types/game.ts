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
