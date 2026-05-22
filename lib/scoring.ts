export function calcBibleQuizPoints(timeMs: number, timerMs = 15000): number {
  return Math.max(0, Math.round(1000 - (timeMs / timerMs) * 1000))
}

export function calcVerseScramblePoints(
  correctWords: number,
  totalWords: number,
  timeMs: number,
  timerMs = 30000,
): number {
  const accuracy = correctWords / totalWords
  const speedMultiplier = 1.0 - (timeMs / timerMs) * 0.5
  return Math.max(0, Math.round(accuracy * 1000 * speedMultiplier))
}

export function calcEmojiStoryPoints(submitted: string, answer: string): number {
  const normalize = (s: string) => s.toLowerCase().trim()
  if (normalize(submitted) === normalize(answer)) return 1000
  const answerWords = normalize(answer).split(' ')
  const submittedNorm = normalize(submitted)
  const matchCount = answerWords.filter((w) => submittedNorm.includes(w)).length
  if (matchCount >= Math.ceil(answerWords.length * 0.6)) return 500
  return 0
}
