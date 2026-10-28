import { describe, it, expect } from 'vitest'
import { myRank } from '@/lib/standings'
import type { Standings } from '@/types/game'

const board: Standings = { mode: 'individual', entries: [
  { id: 'a', name: 'Ana', points: 900 }, { id: 'b', name: 'Budi', points: 700 }, { id: 'c', name: 'Citra', points: 500 },
] }

describe('myRank', () => {
  it('returns position, size and points of the player', () => {
    expect(myRank(board, 'a')).toEqual({ rank: 1, total: 3, points: 900 })
    expect(myRank(board, 'c')).toEqual({ rank: 3, total: 3, points: 500 })
  })
  it('works for team standings by team id', () => {
    const teams: Standings = { mode: 'team', entries: [{ id: 't1', name: 'Tim Merah', color: '#f00', points: 400 }, { id: 't2', name: 'Tim Biru', color: '#00f', points: 380 }] }
    expect(myRank(teams, 't2')).toEqual({ rank: 2, total: 2, points: 380 })
  })
  it('is null when there is nothing to rank against', () => {
    expect(myRank(board, 'zzz')).toBeNull()
    expect(myRank(board, null)).toBeNull()
    expect(myRank(board, undefined)).toBeNull()
    expect(myRank(null, 'a')).toBeNull()
    expect(myRank(undefined, 'a')).toBeNull()
  })
})
