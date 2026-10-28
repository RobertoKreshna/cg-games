import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryQuizSheet } from '@/components/games/MemoryQuizSheet'

const base = {
  reference: 'Yohanes 3:16',
  options: ['Karena begitu besar kasih Allah', 'TUHAN adalah gembalaku', 'Pada mulanya Allah', 'Akulah jalan'],
  answer: 0,
  onChoose: vi.fn(),
  onContinue: vi.fn(),
}

describe('MemoryQuizSheet', () => {
  it('is a modal dialog titled with the reference, listing the four options', () => {
    render(<MemoryQuizSheet {...base} chosen={null} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText(/Yohanes 3:16/)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('focuses the first option so the keyboard works immediately', () => {
    render(<MemoryQuizSheet {...base} chosen={null} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Karena begitu besar kasih Allah/ }))
  })

  it('reports the option that was tapped', () => {
    const onChoose = vi.fn()
    render(<MemoryQuizSheet {...base} onChoose={onChoose} chosen={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Akulah jalan/ }))
    expect(onChoose).toHaveBeenCalledWith(3)
  })

  it('after a right answer shows "Benar!" and a continue button; options are disabled', () => {
    const onContinue = vi.fn()
    render(<MemoryQuizSheet {...base} onContinue={onContinue} chosen={0} />)
    expect(screen.getByRole('status').textContent).toContain('Benar!')
    for (const option of screen.getAllByRole('button').slice(0, 4)) expect((option as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('after a wrong answer says so and marks the right option', () => {
    render(<MemoryQuizSheet {...base} chosen={2} />)
    expect(screen.getByRole('status').textContent).toContain('Salah')
    expect(screen.getByRole('button', { name: /Karena begitu besar kasih Allah/ }).textContent).toContain('✓')
    expect(screen.getByRole('button', { name: /Pada mulanya Allah/ }).textContent).toContain('✗')
  })
})
