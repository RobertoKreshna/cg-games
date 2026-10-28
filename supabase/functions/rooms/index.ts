import { createDb } from '../_shared/db.ts'
import { rooms, players, teams, gameSessions, answers } from '../_shared/schema.ts'
import { corsResponse, json } from '../_shared/cors.ts'
import { broadcastToRoom } from '../_shared/broadcast.ts'
import {
  GAME_TYPES, ROOM_MODES, MAX_PLAYERS_PER_ROOM, MAX_NAME_LENGTH, MAX_QUESTION_COUNT,
  MIN_TEAMS, MAX_TEAMS, generateRoomCode, publicContent, correctAnswerOf, shuffle,
  type GameType,
} from '../_shared/game.ts'
import { eq, and, sql } from 'npm:drizzle-orm'

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// One client per isolate. Creating it per request left a connection open for every call.
const db = createDb()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  const segments = url.pathname.replace(/^.*\/rooms\/?/, '').split('/').filter(Boolean)
  try {
    // POST /rooms → create room
    if (req.method === 'POST' && segments.length === 0) {
      const body = await req.json().catch(() => null)
      const { game_type, mode = 'individual', question_count = 10 } = body ?? {}
      if (!GAME_TYPES.includes(game_type)) return json({ error: 'invalid game_type' }, 400)
      if (!(ROOM_MODES as readonly string[]).includes(mode)) return json({ error: 'invalid mode' }, 400)
      if (!Number.isInteger(question_count) || question_count < 1 || question_count > MAX_QUESTION_COUNT) {
        return json({ error: 'invalid question_count' }, 400)
      }

      let code = ''
      for (let i = 0; i < 10; i++) {
        const candidate = generateRoomCode()
        const existing = await db.select().from(rooms).where(eq(rooms.code, candidate))
        if (existing.length === 0) { code = candidate; break }
      }
      if (!code) return json({ error: 'could not generate unique code' }, 500)

      const hostToken = generateToken()
      const [room] = await db.insert(rooms).values({ code, gameType: game_type, mode, questionCount: question_count, hostToken }).returning()
      return json({ room_id: room.id, code: room.code, host_token: hostToken })
    }

    // POST /rooms/:code/join
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'join') {
      const code = segments[0]
      const body = await req.json().catch(() => null)
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!name) return json({ error: 'name required' }, 400)
      if (name.length > MAX_NAME_LENGTH) return json({ error: 'name too long' }, 400)

      const [room] = await db.select().from(rooms).where(eq(rooms.code, code))
      if (!room) return json({ error: 'room not found' }, 404)
      if (room.status !== 'lobby') return json({ error: 'game already started' }, 400)

      const existingPlayers = await db.select({ name: players.name }).from(players).where(eq(players.roomId, room.id))
      if (existingPlayers.length >= MAX_PLAYERS_PER_ROOM) return json({ error: 'room full' }, 409)
      if (existingPlayers.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return json({ error: 'name taken' }, 409)
      }

      const sessionToken = generateToken()
      const [player] = await db.insert(players).values({
        roomId: room.id,
        name,
        sessionToken,
      }).returning()

      await broadcastToRoom(code, 'player_joined', { player_id: player.id, name: player.name })

      return json({
        player_id: player.id,
        session_token: sessionToken,
        room: { id: room.id, code: room.code, game_type: room.gameType, mode: room.mode },
      })
    }

    // POST /rooms/:code/teams → randomly assign teams (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'teams') {
      const code = segments[0]
      const hostToken = req.headers.get('x-host-token')
      const body = await req.json().catch(() => null)
      const { team_count = 3 } = body ?? {}
      if (!Number.isInteger(team_count) || team_count < MIN_TEAMS || team_count > MAX_TEAMS) {
        return json({ error: 'invalid team_count' }, 400)
      }

      const [room] = await db.select().from(rooms).where(
        and(eq(rooms.code, code), eq(rooms.hostToken, hostToken ?? ''))
      )
      if (!room) return json({ error: 'unauthorized' }, 403)
      if (room.mode !== 'team') return json({ error: 'room is not in team mode' }, 400)
      if (room.status !== 'lobby') return json({ error: 'game already started' }, 409)

      const NAMES = ['Tim Merah', 'Tim Biru', 'Tim Hijau', 'Tim Kuning', 'Tim Ungu']
      const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']

      await db.delete(teams).where(eq(teams.roomId, room.id))
      const createdTeams = await db.insert(teams).values(
        Array.from({ length: team_count }, (_, i) => ({
          roomId: room.id,
          name: NAMES[i] ?? `Tim ${i + 1}`,
          color: COLORS[i] ?? '#6b7280',
        }))
      ).returning()

      const allPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      const shuffled = shuffle(allPlayers)

      await Promise.all(
        shuffled.map((player, i) =>
          db.update(players)
            .set({ teamId: createdTeams[i % team_count].id })
            .where(eq(players.id, player.id))
        )
      )

      const result = createdTeams.map((t, i) => ({
        ...t,
        members: shuffled
          .filter((_, idx) => idx % team_count === i)
          .map((p) => ({ id: p.id, name: p.name })),
      }))

      await broadcastToRoom(code, 'teams_assigned', { teams: result })
      return json({ teams: result })
    }

    // POST /rooms/:code/start → start game (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'start') {
      const code = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [room] = await db.select().from(rooms).where(
        and(eq(rooms.code, code), eq(rooms.hostToken, hostToken ?? ''))
      )
      if (!room) return json({ error: 'unauthorized' }, 403)

      if (room.mode === 'team') {
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(teams).where(eq(teams.roomId, room.id))
        if (count === 0) return json({ error: 'teams not assigned' }, 400)
      }
      const [{ playerCount }] = await db.select({ playerCount: sql<number>`count(*)::int` }).from(players).where(eq(players.roomId, room.id))
      if (playerCount === 0) return json({ error: 'no players' }, 400)

      // Only the request that flips lobby -> playing creates the session; a double click gets 409.
      const [started] = await db.update(rooms).set({ status: 'playing' })
        .where(and(eq(rooms.id, room.id), eq(rooms.status, 'lobby')))
        .returning({ id: rooms.id })
      if (!started) return json({ error: 'game already started' }, 409)

      const [session] = await db.insert(gameSessions).values({
        roomId: room.id,
        startedAt: new Date(),
      }).returning()

      await broadcastToRoom(code, 'game_started', { session_id: session.id })
      return json({ session_id: session.id })
    }

    // GET /rooms/:code/host-state → restore host state after refresh
    if (req.method === 'GET' && segments.length === 2 && segments[1] === 'host-state') {
      const code = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [room] = await db.select().from(rooms).where(
        and(eq(rooms.code, code), eq(rooms.hostToken, hostToken ?? ''))
      )
      if (!room) return json({ error: 'unauthorized' }, 403)

      const [allPlayers, allTeams] = await Promise.all([
        db.select().from(players).where(eq(players.roomId, room.id)),
        db.select().from(teams).where(eq(teams.roomId, room.id)),
      ])

      const playersOut = allPlayers.map((p) => {
        const team = allTeams.find((t) => t.id === p.teamId)
        return { id: p.id, name: p.name, teamName: team?.name, teamColor: team?.color }
      })

      if (room.status === 'lobby') {
        return json({ phase: 'lobby', gameType: room.gameType, mode: room.mode, players: playersOut, teamsAssigned: allTeams.length > 0 })
      }

      const [session] = await db.select().from(gameSessions).where(eq(gameSessions.roomId, room.id))

      if (room.status === 'finished') {
        return json({ phase: 'finished', gameType: room.gameType, mode: room.mode, session_id: session?.id })
      }

      type CachedQ = { id: string; gameType: string; content: unknown }
      const cachedQs = (session?.questionIds as CachedQ[] | null) ?? []
      const totalQ = cachedQs.length
      const currentQ = session && session.status !== 'waiting' ? session.currentQuestionIndex + 1 : 0
      const questionStatus = session?.status === 'question' ? 'showing' : session?.status === 'reveal' ? 'reveal' : 'idle'

      return json({
        phase: 'playing',
        gameType: room.gameType,
        mode: room.mode,
        players: playersOut,
        teamsAssigned: allTeams.length > 0,
        session_id: session?.id,
        questionStatus,
        currentQ,
        totalQ,
      })
    }

    // GET /rooms/:code/state → restore game state after refresh (player)
    if (req.method === 'GET' && segments.length === 2 && segments[1] === 'state') {
      const code = segments[0]
      const sessionToken = req.headers.get('x-session-token')

      const [room] = await db.select().from(rooms).where(eq(rooms.code, code))
      if (!room) return json({ error: 'room not found' }, 404)

      const [player] = await db.select().from(players).where(
        and(eq(players.sessionToken, sessionToken ?? ''), eq(players.roomId, room.id))
      )
      if (!player) return json({ error: 'unauthorized' }, 403)

      if (room.status === 'lobby') return json({ phase: 'lobby' })

      const [session] = await db.select().from(gameSessions).where(eq(gameSessions.roomId, room.id))
      if (!session || session.status === 'waiting') return json({ phase: 'lobby', session_id: session?.id })

      if (session.status === 'finished' || room.status === 'finished') {
        return json({ phase: 'finished', session_id: session.id })
      }

      type CachedQ = { id: string; gameType: string; content: unknown }
      const cachedQs = (session.questionIds as CachedQ[] | null) ?? []
      const q = cachedQs[session.currentQuestionIndex]
      if (!q) return json({ phase: 'lobby' })

      const [existing] = await db.select().from(answers).where(
        and(eq(answers.sessionId, session.id), eq(answers.questionId, q.id), eq(answers.playerId, player.id))
      )

      const phase = session.status === 'reveal' ? 'reveal' : existing ? 'answered' : 'question'
      const gameType = q.gameType as GameType

      return json({
        phase,
        session_id: session.id,
        current_question: {
          question_index: session.currentQuestionIndex,
          question_id: q.id,
          game_type: q.gameType,
          content: publicContent(q.content),
          total_questions: cachedQs.length,
        },
        points: existing?.points ?? null,
        submitted_answer: existing?.submittedAnswer ?? null,
        correct_answer: phase === 'reveal' ? correctAnswerOf(gameType, q.content) : null,
      })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'internal server error' }, 500)
  }
})
