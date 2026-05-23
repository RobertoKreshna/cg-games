import { createDb } from '../_shared/db.ts'
import { gameSessions, questions, answers, players, rooms, teams } from '../_shared/schema.ts'
import { corsResponse, json } from '../_shared/cors.ts'
import { eq, and, sql } from 'npm:drizzle-orm'

// Scoring — duplicated from lib/scoring.ts (Deno cannot import from Next.js lib/)
function calcBibleQuizPoints(timeMs: number): number {
  return Math.max(0, Math.round(1000 - (timeMs / 15000) * 1000))
}

function calcVerseScramblePoints(correctWords: number, totalWords: number, timeMs: number): number {
  const accuracy = correctWords / totalWords
  const speedMultiplier = 1.0 - (timeMs / 30000) * 0.5
  return Math.max(0, Math.round(accuracy * 1000 * speedMultiplier))
}

function calcEmojiStoryPoints(selected: number[], correct: number[]): number {
  const correctCount = selected.filter((i: number) => correct.includes(i)).length
  return Math.round((correctCount / correct.length) * 1000)
}

async function broadcastToRoom(roomCode: string, event: string, payload: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomCode}`, event, payload }],
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  const segments = url.pathname.replace(/^.*\/sessions\/?/, '').split('/').filter(Boolean)
  const db = createDb()

  try {
    // GET /sessions/:id/leaderboard
    if (req.method === 'GET' && segments.length === 2 && segments[1] === 'leaderboard') {
      const sessionId = segments[0]

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))
      if (!row) return json({ error: 'session not found' }, 404)

      if (row.room.mode === 'individual') {
        const leaderboard = await db
          .select({
            playerId: answers.playerId,
            playerName: players.name,
            totalPoints: sql<number>`sum(${answers.points})::int`,
          })
          .from(answers)
          .innerJoin(players, eq(answers.playerId, players.id))
          .where(eq(answers.sessionId, sessionId))
          .groupBy(answers.playerId, players.name)
          .orderBy(sql`sum(${answers.points}) desc`)
        return json({ mode: 'individual', leaderboard })
      } else {
        const leaderboard = await db
          .select({
            teamId: teams.id,
            teamName: teams.name,
            teamColor: teams.color,
            totalPoints: sql<number>`sum(${answers.points})::int`,
          })
          .from(answers)
          .innerJoin(players, eq(answers.playerId, players.id))
          .innerJoin(teams, eq(players.teamId, teams.id))
          .where(eq(answers.sessionId, sessionId))
          .groupBy(teams.id, teams.name, teams.color)
          .orderBy(sql`sum(${answers.points}) desc`)
        return json({ mode: 'team', leaderboard })
      }
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

      const allQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.gameType, row.room.gameType))
        .orderBy(questions.orderIndex)

      // First call: status is 'waiting' → show question 0. Subsequent: increment.
      const nextIndex = row.session.status === 'waiting' ? 0 : row.session.currentQuestionIndex + 1

      if (nextIndex >= allQuestions.length) {
        await db.update(gameSessions).set({ status: 'finished' }).where(eq(gameSessions.id, sessionId))
        await db.update(rooms).set({ status: 'finished' }).where(eq(rooms.id, row.room.id))
        await broadcastToRoom(row.room.code, 'game_finished', { session_id: sessionId })
        return json({ status: 'finished', session_id: sessionId })
      }

      const q = allQuestions[nextIndex]
      await db.update(gameSessions)
        .set({ currentQuestionIndex: nextIndex, status: 'question' })
        .where(eq(gameSessions.id, sessionId))

      await broadcastToRoom(row.room.code, 'question_show', {
        question_index: nextIndex,
        question_id: q.id,
        game_type: q.gameType,
        content: q.content,
        total_questions: allQuestions.length,
      })

      return json({ status: 'question', question_index: nextIndex, question_id: q.id })
    }

    // POST /sessions/:id/answer → submit answer (player)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'answer') {
      const sessionId = segments[0]
      const sessionToken = req.headers.get('x-session-token')
      const { question_id, submitted_answer, time_taken_ms } = await req.json()

      const [player] = await db.select().from(players).where(eq(players.sessionToken, sessionToken ?? ''))
      if (!player) return json({ error: 'unauthorized' }, 403)

      const [question] = await db.select().from(questions).where(eq(questions.id, question_id))
      if (!question) return json({ error: 'question not found' }, 404)

      const content = question.content as Record<string, unknown>
      let isCorrect = false
      let points = 0

      if (question.gameType === 'bible_quiz') {
        isCorrect = submitted_answer === String(content.answer_index)
        points = isCorrect ? calcBibleQuizPoints(time_taken_ms) : 0
      } else if (question.gameType === 'verse_scramble') {
        const correctOrder = content.correct_order as number[]
        const submittedOrder = JSON.parse(submitted_answer) as number[]
        const correctWords = correctOrder.filter((v, i) => v === submittedOrder[i]).length
        isCorrect = correctWords === correctOrder.length
        points = calcVerseScramblePoints(correctWords, correctOrder.length, time_taken_ms)
      } else if (question.gameType === 'emoji_story') {
        const correct = content.correct as number[]
        const selected = JSON.parse(submitted_answer) as number[]
        points = calcEmojiStoryPoints(selected, correct)
        isCorrect = points === 1000
      }

      await db.insert(answers).values({
        playerId: player.id,
        questionId: question_id,
        sessionId,
        submittedAnswer: submitted_answer,
        isCorrect,
        points,
        timeTakenMs: time_taken_ms,
      }).onConflictDoNothing()

      // Auto-reveal when all players in room have answered this question
      const [sessionRow] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))

      const [{ totalPlayers }] = await db
        .select({ totalPlayers: sql<number>`count(*)::int` })
        .from(players)
        .where(eq(players.roomId, sessionRow.room.id))

      const [{ answeredCount }] = await db
        .select({ answeredCount: sql<number>`count(*)::int` })
        .from(answers)
        .where(and(eq(answers.sessionId, sessionId), eq(answers.questionId, question_id)))

      if (answeredCount >= totalPlayers) {
        await db.update(gameSessions).set({ status: 'reveal' }).where(eq(gameSessions.id, sessionId))
        await broadcastToRoom(sessionRow.room.code, 'question_reveal', {
          question_id,
          correct_answer: content.answer_index ?? content.correct,
        })
      }

      return json({ points, is_correct: isCorrect })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'internal server error' }, 500)
  }
})
