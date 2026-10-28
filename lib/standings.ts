import type { Standings } from '@/types/game'

export interface MyRank {
  rank: number
  total: number
  points: number
}

/** Where `meId` (player id, or team id in team mode) stands, or null if not in the ranking. */
export function myRank(standings: Standings | null | undefined, meId: string | null | undefined): MyRank | null {
  if (!standings || !meId) return null
  const index = standings.entries.findIndex((e) => e.id === meId)
  if (index < 0) return null
  return { rank: index + 1, total: standings.entries.length, points: standings.entries[index].points }
}
