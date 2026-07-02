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
  try {
    const raw = localStorage.getItem(`player:${roomCode}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveHostSession(roomCode: string, data: HostSession): void {
  localStorage.setItem(`host:${roomCode}`, JSON.stringify(data))
}

export function getHostSession(roomCode: string): HostSession | null {
  try {
    const raw = localStorage.getItem(`host:${roomCode}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function updateHostSession(roomCode: string, patch: Partial<HostSession>): void {
  const existing = getHostSession(roomCode) ?? { hostToken: '', roomId: '' }
  saveHostSession(roomCode, { ...existing, ...patch })
}

export function setCurrentPlayerRoom(code: string): void {
  localStorage.setItem('player:current', code)
}

export function getCurrentPlayerRoom(): string | null {
  return localStorage.getItem('player:current')
}

export function clearPlayerSession(roomCode: string): void {
  localStorage.removeItem('player:current')
  localStorage.removeItem(`player:${roomCode}`)
}

export function setCurrentHostRoom(code: string): void {
  localStorage.setItem('host:current', code)
}

export function getCurrentHostRoom(): string | null {
  return localStorage.getItem('host:current')
}

export function clearHostSession(roomCode: string): void {
  localStorage.removeItem('host:current')
  localStorage.removeItem(`host:${roomCode}`)
}
