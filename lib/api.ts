const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
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

export function submitAnswer(
  sessionId: string,
  sessionToken: string,
  data: { question_id: string; submitted_answer: string; time_taken_ms: number },
) {
  return call(`/sessions/${sessionId}/answer`, {
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

export function getLeaderboard(sessionId: string) {
  return call(`/sessions/${sessionId}/leaderboard`)
}
