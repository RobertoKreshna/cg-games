import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const base = { title: 'Keluarkan Budi?', description: 'Skornya dihapus.', confirmLabel: 'Keluarkan' }

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<ConfirmDialog {...base} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('is an accessible dialog with title and description, focusing the safe (cancel) choice', () => {
    render(<ConfirmDialog {...base} open onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Keluarkan Budi?')).toBeTruthy()
    expect(screen.getByText('Skornya dihapus.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Batal' }))
  })

  it('confirm and cancel call their handlers', () => {
    const onConfirm = vi.fn(), onCancel = vi.fn()
    render(<ConfirmDialog {...base} open onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keluarkan' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape and a click on the backdrop cancel, but a click inside does not', () => {
    const onCancel = vi.fn()
    const { container } = render(<ConfirmDialog {...base} open onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(container.firstElementChild as Element)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('while busy both buttons are disabled so it cannot be double-submitted', () => {
    render(<ConfirmDialog {...base} open busy onConfirm={vi.fn()} onCancel={vi.fn()} />)
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
  })
})
