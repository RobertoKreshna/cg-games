import { reportClientError } from './report'

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface CallOptions extends RequestInit {
  /** Extra attempts after a network error or 5xx. Only for requests that are safe to repeat. */
  retries?: number
}

async function call(path: string, { retries = 0, ...options }: CallOptions = {}) {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${BASE}${path}`, options)
    } catch (e) {
      if (attempt < retries) { await sleep(400 * (attempt + 1)); continue }
      reportClientError(`api ${path}`, e)
      throw e
    }
    if (res.status >= 500 && attempt < retries) { await sleep(400 * (attempt + 1)); continue }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = (body as { error?: string }).error ?? `HTTP ${res.status}`
      // 4xx are expected (bad code, name taken, ...); only server faults are worth an alert.
      if (res.status >= 500) reportClientError(`api ${path}`, new Error(`HTTP ${res.status}: ${message}`))
      throw new Error(message)
    }
    return res.json()
  }
}

export function createRoom(gameType: string, mode: string, questionCount: number) {
  return call('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: gameType, mode, question_count: questionCount }),
  })
}

export function joinRoom(code: string, name: string) {
  return call(`/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function rejoinRoom(code: string, name: string) {
  return call(`/rooms/${code}/rejoin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function assignTeams(code: string, hostToken: string, teamCount: number) {
  return call(`/rooms/${code}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({ team_count: teamCount }),
  })
}

export function startGame(code: string, hostToken: string) {
  return call(`/rooms/${code}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function nextQuestion(sessionId: string, hostToken: string) {
  return call(`/sessions/${sessionId}/next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function kickPlayer(code: string, hostToken: string, playerId: string) {
  return call(`/rooms/${code}/kick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({ player_id: playerId }),
  })
}

/** Ends a running game, or closes the room if it has not started. Safe to repeat. */
export function endGame(code: string, hostToken: string) {
  return call(`/rooms/${code}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function revealQuestion(sessionId: string, hostToken: string) {
  return call(`/sessions/${sessionId}/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function submitAnswer(
  sessionId: string,
  sessionToken: string,
  data: { question_id: string; submitted_answer: string; time_taken_ms: number },
) {
  // Safe to retry: the server stores the first answer and replays its result for repeats.
  return call(`/sessions/${sessionId}/answer`, {
    retries: 2,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken },
    body: JSON.stringify(data),
  })
}

export function getHostState(code: string, hostToken: string) {
  return call(`/rooms/${code}/host-state`, {
    headers: { 'x-host-token': hostToken },
  })
}

export function getRoomState(code: string, sessionToken: string) {
  return call(`/rooms/${code}/state`, {
    headers: { 'x-session-token': sessionToken },
  })
}

export function getLeaderboard(sessionId: string, sessionToken?: string) {
  return call(`/sessions/${sessionId}/leaderboard`, {
    headers: sessionToken ? { 'x-session-token': sessionToken } : {},
  })
}
