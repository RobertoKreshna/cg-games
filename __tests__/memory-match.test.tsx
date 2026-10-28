import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const submitAnswer = vi.fn()
vi.mock('@/lib/api', () => ({ submitAnswer: (...args: unknown[]) => submitAnswer(...args) }))

import { MemoryMatch } from '@/components/games/MemoryMatch'
import type { MemoryBoard } from '@/lib/memory-rules'

// 4 cards: pair 0 = ids 0 and 2, pair 1 = ids 1 and 3.
const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 60_000,
  cards: [
    { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
    { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
  ],
  quiz: [
    { pair: 0, options: ['ayat Yohanes', 'b', 'c', 'd'], answer: 0 },
    { pair: 1, options: ['a', 'ayat Mazmur', 'c', 'd'], answer: 1 },
  ],
}

function renderBoard(onAnswered = vi.fn()) {
  render(
    <MemoryMatch
      questionId="q1" content={board} sessionId="s1" sessionToken="t1"
      questionIndex={0} totalQuestions={1} onAnswered={onAnswered}
    />,
  )
  return onAnswered
}
const card = (id: number) => screen.getByRole('button', { name: new RegExp(`^Kartu ${id + 1},`) })
const tap = (id: number) => fireEvent.click(card(id))
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }

describe('MemoryMatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    submitAnswer.mockReset()
    submitAnswer.mockResolvedValue({ points: 700, is_correct: true })
  })
  afterEach(() => { vi.useRealTimers() })

  it('shows every card face down with an accessible label and the pair counter', () => {
    renderBoard()
    expect(screen.getAllByRole('button', { name: /tertutup/ })).toHaveLength(4)
    expect(screen.getByText(/0\s*\/\s*2 pasang/)).toBeTruthy()
  })

  it('opens a tapped card and labels it with its reference', () => {
    renderBoard()
    tap(0)
    expect(card(0).getAttribute('aria-label')).toContain('terbuka: Yohanes 3:16')
  })

  it('closes a mismatch after exactly hideMs and ignores taps in between', () => {
    renderBoard()
    tap(0); tap(1)
    expect(screen.getByText(/1 salah/)).toBeTruthy()
    tap(2) // locked
    expect(card(2).getAttribute('aria-label')).toContain('tertutup')
    act(() => { vi.advanceTimersByTime(999) })
    expect(card(0).getAttribute('aria-label')).toContain('terbuka')
    act(() => { vi.advanceTimersByTime(1) })
    expect(card(0).getAttribute('aria-label')).toContain('tertutup')
    expect(card(1).getAttribute('aria-label')).toContain('tertutup')
  })

  it('opens the multiple choice when a pair matches, and gives feedback then closes by itself', () => {
    renderBoard()
    tap(0); tap(2)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Yohanes 3:16/, { selector: 'h2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    expect(screen.getByRole('status').textContent).toContain('Benar!')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/1\s*\/\s*2 pasang/)).toBeTruthy()
  })

  it('lets the player continue early with the Lanjut button', () => {
    renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('submits the log as soon as the last pair is answered', async () => {
    const onAnswered = renderBoard()
    tap(0); tap(1)
    act(() => { vi.advanceTimersByTime(1000) })
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    expect(submitAnswer).toHaveBeenCalledTimes(1)
    const [sessionId, token, payload] = submitAnswer.mock.calls[0]
    expect(sessionId).toBe('s1')
    expect(token).toBe('t1')
    expect(payload.question_id).toBe('q1')
    expect(JSON.parse(payload.submitted_answer)).toEqual({ f: [0, 1, 0, 2, 1, 3], q: [[0, 0], [1, 1]] })
    expect(typeof payload.time_taken_ms).toBe('number')
    expect(onAnswered).toHaveBeenCalledWith(700, payload.submitted_answer)
  })

  it('submits what it has when the timer runs out', async () => {
    const onAnswered = renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_500) })
    expect(submitAnswer).toHaveBeenCalledTimes(1)
    const payload = submitAnswer.mock.calls[0][2]
    expect(JSON.parse(payload.submitted_answer)).toEqual({ f: [0, 2], q: [[0, 0]] })
    expect(payload.time_taken_ms).toBe(60_000)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  it('shows a retry when the final submit fails, and succeeds on the second try', async () => {
    submitAnswer.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ points: 500, is_correct: true })
    const onAnswered = renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('belum terkirim')
    expect(onAnswered).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Kirim ulang/ }))
    await flush()
    expect(submitAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswered).toHaveBeenCalledWith(500, expect.any(String))
  })

  it('does not submit twice for the same board', async () => {
    renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000) }) // timer expires after finishing
    expect(submitAnswer).toHaveBeenCalledTimes(1)
  })
})
