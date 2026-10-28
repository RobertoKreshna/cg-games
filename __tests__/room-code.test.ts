import { describe, it, expect } from 'vitest'
import { normalizeRoomCode, isCompleteRoomCode, joinLink } from '@/lib/room-code'

describe('normalizeRoomCode', () => {
  it('upper-cases, strips junk and caps at 6 characters', () => {
    expect(normalizeRoomCode('k7m4qx')).toBe('K7M4QX')
    expect(normalizeRoomCode(' k7-m4 qx ')).toBe('K7M4QX')
    expect(normalizeRoomCode('K7M4QXZZZ')).toBe('K7M4QX')
  })
  it('handles missing, repeated and hostile values', () => {
    expect(normalizeRoomCode(undefined)).toBe('')
    expect(normalizeRoomCode(null)).toBe('')
    expect(normalizeRoomCode(['abc123', 'zzz'])).toBe('ABC123')
    expect(normalizeRoomCode('<script>alert(1)</script>')).toBe('SCRIPT')
  })
})

describe('isCompleteRoomCode / joinLink', () => {
  it('only a full 6 character code counts as complete', () => {
    expect(isCompleteRoomCode('K7M4QX')).toBe(true)
    expect(isCompleteRoomCode('K7M4Q')).toBe(false)
    expect(isCompleteRoomCode('')).toBe(false)
  })
  it('builds a link that lands on the join page with the code', () => {
    expect(joinLink('https://cg.example.com', 'K7M4QX')).toBe('https://cg.example.com/join?code=K7M4QX')
  })
})
