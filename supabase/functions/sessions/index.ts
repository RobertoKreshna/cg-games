import { createDb } from '../_shared/db.ts'
import { gameSessions, questions, answers, players, rooms } from '../_shared/schema.ts'
import { corsResponse, json } from '../_shared/cors.ts'
import { broadcastToRoom } from '../_shared/broadcast.ts'
import { revealIfComplete, forceReveal, type CachedQ } from '../_shared/reveal.ts'
import { computeStandings } from '../_shared/standings.ts'
import { reportError } from '../_shared/report.ts'
import {
  effectiveTimeMs, isPastDeadline, scoreAnswer, publicContent, shuffle,
  timerMsOf, maxAnswerLength, MAX_MEMORY_ANSWER_LENGTH,
} from '../_shared/game.ts'
import { buildBoard, scoreMemoryAnswer, type MemoryVerse } from '../_shared/memory.ts'
import { eq, and } from 'npm:drizzle-orm'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One client per isolate. Creating it per request left a connection open for every call.
const db = createDb()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  const segments = url.pathname.replace(/^.*\/sessions\/?/, '').split('/').filter(Boolean)
  try {
    // A malformed id would otherwise surface as a database error (and a false alarm in Discord).
    if (!UUID.test(segments[0] ?? '')) return json({ error: 'not found' }, 404)

    // GET /sessions/:id/leaderboard
    if (req.method === 'GET' && segments.length === 2 && segments[1] === 'leaderboard') {
      const sessionId = segments[0]

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))
      if (!row) return json({ error: 'session not found' }, 404)

      const standings = await computeStandings(db, row.room.id, row.room.mode, sessionId)

      // A player's own token tells the results page which row is theirs.
      const sessionToken = req.headers.get('x-session-token')
      const [me] = sessionToken
        ? await db.select({ id: players.id, teamId: players.teamId }).from(players)
            .where(and(eq(players.sessionToken, sessionToken), eq(players.roomId, row.room.id)))
        : []

      const leaderboard = standings.entries.map((e) =>
        standings.mode === 'individual'
          ? { playerId: e.id, playerName: e.name, totalPoints: e.points }
          : { teamId: e.id, teamName: e.name, teamColor: e.color, totalPoints: e.points }
      )
      return json({ mode: standings.mode, leaderboard, me: me ? { playerId: me.id, teamId: me.teamId } : null })
    }

    // POST /sessions/:id/next → advance question (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'next') {
      const sessionId = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(and(eq(gameSessions.id, sessionId), eq(rooms.hostToken, hostToken ?? '')))
      if (!row) return json({ error: 'unauthorized' }, 403)

      const { status, currentQuestionIndex } = row.session
      if (status === 'finished') return json({ error: 'game already finished' }, 409)
      if (status === 'question') return json({ error: 'question still in progress' }, 409)

      // Cache stores full question objects — no per-question DB lookup after first call
      let cachedQs: CachedQ[] = (row.session.questionIds as CachedQ[] | null) ?? []
      const isFirstCall = cachedQs.length === 0

      if (isFirstCall) {
        if (row.room.gameType === 'memory_match') {
          // One board per game, built from the Verse Scramble verses and stored as a questions row so
          // answers.question_id keeps its foreign key.
          const verseRows = await db
            .select({ content: questions.content })
            .from(questions)
            .where(eq(questions.gameType, 'verse_scramble'))
          const verses: MemoryVerse[] = verseRows.map(({ content }) => {
            const c = content as { reference: string; words: string[]; correct_order: number[] }
            return { reference: c.reference, text: c.correct_order.map((i) => c.words[i]).join(' ') }
          })
          const board = buildBoard(verses, row.room.memoryCards, row.room.memoryDelayMs)
          const [boardRow] = await db.insert(questions)
            .values({ gameType: 'memory_match', orderIndex: 0, content: board })
            .returning({ id: questions.id })
          cachedQs = [{ id: boardRow.id, gameType: 'memory_match', content: board }]
        } else {
          const pool = await db
            .select({ id: questions.id, gameType: questions.gameType, content: questions.content })
            .from(questions)
            .where(eq(questions.gameType, row.room.gameType))
          cachedQs = shuffle(pool).slice(0, row.room.questionCount)
        }
      }

      const nextIndex = status === 'waiting' ? 0 : currentQuestionIndex + 1

      // Every transition is guarded by the status/index we read, so two quick taps on "next"
      // cannot skip a question: only one of them matches and the other gets 409.
      const unchanged = and(
        eq(gameSessions.id, sessionId),
        eq(gameSessions.status, status),
        eq(gameSessions.currentQuestionIndex, currentQuestionIndex),
      )

      if (nextIndex >= cachedQs.length) {
        const [finished] = await db.update(gameSessions).set({ status: 'finished' }).where(unchanged)
          .returning({ id: gameSessions.id })
        if (!finished) return json({ error: 'session changed, retry' }, 409)
        await db.update(rooms).set({ status: 'finished' }).where(eq(rooms.id, row.room.id))
        await broadcastToRoom(row.room.code, 'game_finished', { session_id: sessionId })
        return json({ status: 'finished', session_id: sessionId })
      }

      const q = cachedQs[nextIndex]
      const [advanced] = await db.update(gameSessions).set({
        ...(isFirstCall ? { questionIds: cachedQs as unknown } : {}),
        currentQuestionIndex: nextIndex,
        status: 'question',
        questionStartedAt: new Date(),
      }).where(unchanged).returning({ id: gameSessions.id })
      if (!advanced) return json({ error: 'session changed, retry' }, 409)

      // Players get the question without its answer; that is sent with question_reveal.
      await broadcastToRoom(row.room.code, 'question_show', {
        session_id: sessionId,
        question_index: nextIndex,
        question_id: q.id,
        game_type: q.gameType,
        content: publicContent(q.content),
        total_questions: cachedQs.length,
      })

      return json({ status: 'question', question_index: nextIndex, question_id: q.id })
    }

    // POST /sessions/:id/reveal → end the current question now (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'reveal') {
      const sessionId = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(and(eq(gameSessions.id, sessionId), eq(rooms.hostToken, hostToken ?? '')))
      if (!row) return json({ error: 'unauthorized' }, 403)

      const cachedQs = (row.session.questionIds as CachedQ[] | null) ?? []
      const q = cachedQs[row.session.currentQuestionIndex]
      if (!q) return json({ error: 'no active question' }, 409)

      if (!(await forceReveal(db, row.room, sessionId, q))) return json({ error: 'question is not active' }, 409)
      return json({ status: 'reveal' })
    }

    // POST /sessions/:id/answer → submit answer (player)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'answer') {
      const sessionId = segments[0]
      const sessionToken = req.headers.get('x-session-token')
      const body = await req.json().catch(() => null)
      if (!body) return json({ error: 'invalid request body' }, 400)
      const { question_id, submitted_answer, time_taken_ms } = body
      if (
        typeof question_id !== 'string' ||
        typeof submitted_answer !== 'string' || submitted_answer.length > MAX_MEMORY_ANSWER_LENGTH ||
        typeof time_taken_ms !== 'number' || !Number.isFinite(time_taken_ms)
      ) {
        return json({ error: 'missing required fields' }, 400)
      }

      const [player] = await db.select().from(players).where(eq(players.sessionToken, sessionToken ?? ''))
      if (!player) return json({ error: 'unauthorized' }, 403)

      // Fetch session+room once; use for auth, question validation, broadcast, and reveal
      const [sessionRow] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))

      if (!sessionRow) return json({ error: 'session not found' }, 404)
      if (player.roomId !== sessionRow.room.id) return json({ error: 'unauthorized' }, 403)

      async function previousAnswer() {
        const [prev] = await db.select().from(answers).where(
          and(eq(answers.sessionId, sessionId), eq(answers.questionId, question_id), eq(answers.playerId, player.id))
        )
        return json({ points: prev?.points ?? 0, is_correct: prev?.isCorrect ?? false })
      }

      // Only the live question accepts answers. After the reveal the correct answer is public,
      // so a late submission must not be scored.
      const cachedQs = (sessionRow.session.questionIds as CachedQ[] | null) ?? []
      const current = cachedQs[sessionRow.session.currentQuestionIndex]
      if (!current || current.id !== question_id) return json({ error: 'not the current question' }, 400)
      if (sessionRow.session.status !== 'question') return previousAnswer()

      // Memory answers may be long (a flip log); every other game keeps the short limit.
      if (submitted_answer.length > maxAnswerLength(current.gameType)) return json({ error: 'missing required fields' }, 400)

      const timerMs = timerMsOf(current.gameType, current.content)
      const startedAt = sessionRow.session.questionStartedAt
      const serverElapsed = startedAt ? Date.now() - startedAt.getTime() : time_taken_ms
      const timeMs = effectiveTimeMs(time_taken_ms, serverElapsed, timerMs)

      const scored = current.gameType === 'memory_match'
        ? scoreMemoryAnswer(current.content, submitted_answer, timeMs)
        : scoreAnswer(current.gameType, current.content, submitted_answer, timeMs)
      if (!scored.ok) return json({ error: scored.error }, 400)
      const points = isPastDeadline(serverElapsed, timerMs) ? 0 : scored.points

      const [insertedAnswer] = await db.insert(answers).values({
        playerId: player.id,
        questionId: question_id,
        sessionId,
        submittedAnswer: submitted_answer,
        isCorrect: scored.isCorrect,
        points,
        timeTakenMs: Math.round(timeMs),
      }).onConflictDoNothing().returning({ id: answers.id })

      // Already answered: report the stored result rather than re-scoring.
      if (!insertedAnswer) return previousAnswer()

      await broadcastToRoom(sessionRow.room.code, 'player_answered', { player_id: player.id, name: player.name })

      await revealIfComplete(db, sessionRow.room, sessionId, current)

      return json({ points, is_correct: scored.isCorrect })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    await reportError('edge/sessions', e, req)
    return json({ error: 'internal server error' }, 500)
  }
})
