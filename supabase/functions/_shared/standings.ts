import { and, eq, sql } from 'npm:drizzle-orm'
import type { createDb } from './db.ts'
import { answers, players, teams } from './schema.ts'

type Db = ReturnType<typeof createDb>

export interface StandingEntry {
  id: string
  name: string
  color?: string
  points: number
}

export interface Standings {
  mode: 'individual' | 'team'
  entries: StandingEntry[]
}

// Sorts players who never answered below those who did when points tie.
const NO_TIME = 2147483647

/**
 * Current ranking for a session. Everyone in the room is listed, including players who have not
 * answered yet. Team score is the average per member so a bigger team has no advantage.
 */
export async function computeStandings(
  db: Db,
  roomId: string,
  mode: 'individual' | 'team',
  sessionId: string,
): Promise<Standings> {
  if (mode === 'individual') {
    const rows = await db
      .select({
        id: players.id,
        name: players.name,
        points: sql<number>`coalesce(sum(${answers.points}), 0)::int`,
      })
      .from(players)
      .leftJoin(answers, and(eq(answers.playerId, players.id), eq(answers.sessionId, sessionId)))
      .where(eq(players.roomId, roomId))
      .groupBy(players.id, players.name)
      .orderBy(
        sql`coalesce(sum(${answers.points}), 0) desc`,
        sql`coalesce(sum(${answers.timeTakenMs}), ${NO_TIME}) asc`,
        players.name,
      )
    return { mode, entries: rows }
  }

  const members = sql`greatest(count(distinct ${players.id}), 1)`
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      color: teams.color,
      points: sql<number>`round(coalesce(sum(${answers.points}), 0)::numeric / ${members})::int`,
    })
    .from(teams)
    .leftJoin(players, eq(players.teamId, teams.id))
    .leftJoin(answers, and(eq(answers.playerId, players.id), eq(answers.sessionId, sessionId)))
    .where(eq(teams.roomId, roomId))
    .groupBy(teams.id, teams.name, teams.color)
    .orderBy(
      sql`round(coalesce(sum(${answers.points}), 0)::numeric / ${members}) desc`,
      sql`coalesce(sum(${answers.timeTakenMs}), ${NO_TIME})::numeric / ${members} asc`,
      teams.name,
    )
  return { mode, entries: rows }
}
