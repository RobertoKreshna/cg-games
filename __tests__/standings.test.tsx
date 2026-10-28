import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StandingsCard } from '@/components/shared/Standings'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { Standings } from '@/types/game'

const individual = (n: number): Standings => ({
  mode: 'individual',
  entries: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, points: 1000 - i * 10 })),
})

describe('StandingsCard', () => {
  it('shows the top 5 only', () => {
    render(<StandingsCard standings={individual(8)} />)
    expect(screen.getByText('Player 5')).toBeTruthy()
    expect(screen.queryByText('Player 6')).toBeNull()
  })

  it('adds the player own row when they are outside the top 5', () => {
    render(<StandingsCard standings={individual(8)} meId="p6" />)
    expect(screen.getByText('Player 7')).toBeTruthy()
    expect(screen.getByText('Kamu')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('does not duplicate the player when they are already in the top 5', () => {
    render(<StandingsCard standings={individual(8)} meId="p1" />)
    expect(screen.getAllByText('Player 2').length).toBe(1)
    expect(screen.getAllByText('Kamu').length).toBe(1)
  })

  it('explains the team score', () => {
    render(<StandingsCard standings={{ mode: 'team', entries: [{ id: 't', name: 'Tim Merah', color: '#f00', points: 500 }] }} />)
    expect(screen.getByText(/rata-rata per anggota/)).toBeTruthy()
  })
})

describe('Leaderboard', () => {
  it('marks the current player or team', () => {
    render(<Leaderboard mode="team" meId="t2" entries={[
      { teamId: 't1', teamName: 'Tim Merah', teamColor: '#f00', totalPoints: 900 },
      { teamId: 't2', teamName: 'Tim Biru', teamColor: '#00f', totalPoints: 400 },
    ]} />)
    expect(screen.getAllByText('Kamu').length).toBe(1)
    expect(screen.getByText('Tim Biru').parentElement?.textContent).toContain('Kamu')
  })
})
