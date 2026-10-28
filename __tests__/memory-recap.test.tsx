import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRecap, parseMemoryAnswers } from '@/components/shared/MemoryRecap'
import type { MemoryBoard } from '@/lib/memory-rules'

const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 60_000,
  cards: [
    { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
    { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
  ],
  quiz: [
    { pair: 0, options: ['Karena begitu besar kasih Allah', 'b', 'c', 'd'], answer: 0 },
    { pair: 1, options: ['a', 'TUHAN adalah gembalaku', 'c', 'd'], answer: 1 },
  ],
}

describe('parseMemoryAnswers', () => {
  it('reads [pair, option] entries from a submitted result', () => {
    expect([...parseMemoryAnswers(JSON.stringify({ f: [], q: [[0, 2], [1, 3]] }))]).toEqual([[0, 2], [1, 3]])
  })
  it('returns an empty map for anything unusable', () => {
    expect(parseMemoryAnswers(null).size).toBe(0)
    expect(parseMemoryAnswers('nope').size).toBe(0)
    expect(parseMemoryAnswers(JSON.stringify({ q: 'x' })).size).toBe(0)
    expect(parseMemoryAnswers(JSON.stringify({ q: [[0]] })).size).toBe(0)
  })
})

describe('MemoryRecap', () => {
  it('lists every verse with the correct text and a mark for the player', () => {
    render(<MemoryRecap board={board} submitted={JSON.stringify({ f: [], q: [[0, 0], [1, 3]] })} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Yohanes 3:16')).toBeTruthy()
    expect(within(items[0]).getByText('Karena begitu besar kasih Allah')).toBeTruthy()
    expect(within(items[0]).getByLabelText('benar')).toBeTruthy()
    expect(within(items[1]).getByLabelText('salah')).toBeTruthy()
    expect(within(items[1]).getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })

  it('marks verses that were never answered', () => {
    render(<MemoryRecap board={board} submitted={null} />)
    expect(screen.getAllByLabelText('belum dijawab')).toHaveLength(2)
  })

  it('without a submitted result (host view) shows the verses without marks', () => {
    render(<MemoryRecap board={board} submitted={undefined} />)
    expect(screen.queryByLabelText('benar')).toBeNull()
    expect(screen.queryByLabelText('belum dijawab')).toBeNull()
    expect(screen.getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })
})
