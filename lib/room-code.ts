const CODE_LENGTH = 6

/** Cleans a room code typed by hand or taken from a link: upper case, letters and digits only. */
export function normalizeRoomCode(input: string | string[] | undefined | null): string {
  const raw = Array.isArray(input) ? input[0] : input
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH
}

/** The link players open (or scan) to land on the join page with the code already filled in. */
export function joinLink(origin: string, code: string): string {
  return `${origin}/join?code=${encodeURIComponent(code)}`
}
