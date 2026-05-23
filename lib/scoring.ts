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

export function calcEmojiStoryPoints(selected: number[], correct: number[]): number {
  const correctCount = selected.filter((i) => correct.includes(i)).length
  return Math.round((correctCount / correct.length) * 1000)
}
