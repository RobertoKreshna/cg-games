'use client'
import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel = 'Batal', danger, busy, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the safe choice, and let Escape back out.
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-desc' : undefined}
        className="card w-full max-w-sm p-5 flex flex-col gap-4 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="confirm-title" className="font-display text-xl font-semibold">{title}</h2>
          {description && <p id="confirm-desc" className="text-mist text-sm font-semibold mt-1.5">{description}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`py-3.5 text-base w-full ${danger ? 'rounded-2xl font-extrabold bg-rose-500 text-white shadow-[0_5px_0_#9f1239] active:translate-y-1 disabled:opacity-50' : 'btn-primary'}`}
          >
            {busy ? '...' : confirmLabel}
          </button>
          <button ref={cancelRef} onClick={onCancel} disabled={busy} className="btn-secondary py-3 text-sm w-full">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
