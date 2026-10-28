import { and, eq, sql } from 'npm:drizzle-orm'
import type { createDb } from './db.ts'
import { gameSessions } from './schema.ts'
import { broadcastToRoom } from './broadcast.ts'
import { computeStandings } from './standings.ts'
import { reportError } from './report.ts'
import { correctAnswerOf, type GameType } from './game.ts'

type Db = ReturnType<typeof createDb>

export type CachedQ = { id: string; gameType: GameType; content: unknown }
export type RoomRef = { id: string; code: string; mode: 'individual' | 'team' }

// The ranking sent with every reveal. If it cannot be computed the reveal still goes out.
export async function revealPayload(db: Db, room: { id: string; mode: 'individual' | 'team' }, sessionId: string, q: CachedQ) {
  let standings = null
  try {
    standings = await computeStandings(db, room.id, room.mode, sessionId)
  } catch (e) {
    console.error('standings failed', e)
    await reportError('standings', e)
  }
  return { question_id: q.id, correct_answer: correctAnswerOf(q.gameType, q.content), standings }
}

/**
 * Reveals the question if every player in the room has answered it. Atomic: only the call that
 * moves the session from 'question' to 'reveal' broadcasts, so two simultaneous submissions (or a
 * submission and a kick) cannot both reveal. Returns whether this call revealed.
 */
export async function revealIfComplete(db: Db, room: RoomRef, sessionId: string, q: CachedQ): Promise<boolean> {
  const [revealed] = await db
    .update(gameSessions)
    .set({ status: 'reveal' })
    .where(sql`id = ${sessionId} AND status = 'question' AND (SELECT COUNT(*) FROM answers WHERE session_id = ${sessionId} AND question_id = ${q.id}) >= (SELECT COUNT(*) FROM players WHERE room_id = ${room.id})`)
    .returning({ id: gameSessions.id })
  if (!revealed) return false
  await broadcastToRoom(room.code, 'question_reveal', await revealPayload(db, room, sessionId, q))
  return true
}

/** Host-forced reveal of the current question. Returns false if it was not in the 'question' state. */
export async function forceReveal(db: Db, room: RoomRef, sessionId: string, q: CachedQ): Promise<boolean> {
  const [revealed] = await db.update(gameSessions).set({ status: 'reveal' })
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.status, 'question')))
    .returning({ id: gameSessions.id })
  if (!revealed) return false
  await broadcastToRoom(room.code, 'question_reveal', await revealPayload(db, room, sessionId, q))
  return true
}
