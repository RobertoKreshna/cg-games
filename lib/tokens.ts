interface PlayerSession {
  sessionToken: string
  playerId: string
  gameType?: string
  mode?: string
}

interface HostSession {
  hostToken: string
  roomId: string
  sessionId?: string
}

export function savePlayerSession(roomCode: string, data: PlayerSession): void {
  localStorage.setItem(`player:${roomCode}`, JSON.stringify(data))
}

export function getPlayerSession(roomCode: string): PlayerSession | null {
  const raw = localStorage.getItem(`player:${roomCode}`)
  return raw ? JSON.parse(raw) : null
}

export function saveHostSession(roomCode: string, data: HostSession): void {
  localStorage.setItem(`host:${roomCode}`, JSON.stringify(data))
}

export function getHostSession(roomCode: string): HostSession | null {
  const raw = localStorage.getItem(`host:${roomCode}`)
  return raw ? JSON.parse(raw) : null
}

export function updateHostSession(roomCode: string, patch: Partial<HostSession>): void {
  const existing = getHostSession(roomCode) ?? { hostToken: '', roomId: '' }
  saveHostSession(roomCode, { ...existing, ...patch })
}

export function setCurrentHostRoom(code: string): void {
  localStorage.setItem('host:current', code)
}

export function getCurrentHostRoom(): string | null {
  return localStorage.getItem('host:current')
}

export function clearCurrentHostRoom(): void {
  localStorage.removeItem('host:current')
}
