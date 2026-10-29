'use client'
import { useEffect, useRef, useState } from 'react'
import {
  DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import { now } from '@/lib/clock'
import { TIMER_MS, shuffle } from '@/lib/scoring'
import type { VerseScrambleContent } from '@/types/game'

interface Props {
  questionId: string
  content: VerseScrambleContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  /** Time already spent on this question, e.g. when the page was refreshed mid-question. */
  elapsedMs?: number
  onAnswered: (points: number, submittedAnswer: string) => void
}

/** A placed word: drag to reorder, tap to send it back. */
function PlacedWord({ id, label, disabled, onRemove }: { id: number; label: string; disabled: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onRemove}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`bg-accent text-night px-3 py-1.5 rounded-lg font-bold text-sm cursor-grab touch-none select-none [-webkit-touch-callout:none] shadow-[0_2px_0_#b36b00] ${isDragging ? 'z-10 opacity-80 scale-105' : 'active:scale-95'}`}
    >
      {label}
    </button>
  )
}

export function VerseScramble({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, elapsedMs = 0, onAnswered }: Props) {
  const [placed, setPlaced] = useState<number[]>([])
  const [available, setAvailable] = useState<number[]>(() => shuffle(content.words.map((_, i) => i)))
  const [answered, setAnswered] = useState(false)
  const [sendError, setSendError] = useState(false)
  const startRef = useRef(0)
  const draggedRef = useRef(false)
  // Moving a word a few pixels starts a drag; a plain tap still removes it. TouchSensor (not
  // PointerSensor) because it registers the non-passive touchmove listener iOS Safari needs.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
  )
  useEffect(() => {
    startRef.current = now() - elapsedMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function tap(wordIndex: number) {
    if (answered) return
    setAvailable((p) => p.filter((i) => i !== wordIndex))
    setPlaced((p) => [...p, wordIndex])
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    // The click that ends a drag must not also remove the word.
    draggedRef.current = true
    setTimeout(() => { draggedRef.current = false }, 0)
    if (!over || active.id === over.id) return
    setPlaced((p) => arrayMove(p, p.indexOf(Number(active.id)), p.indexOf(Number(over.id))))
  }

  function remove(pos: number) {
    if (answered || draggedRef.current) return
    const wordIndex = placed[pos]
    setPlaced((p) => p.filter((_, i) => i !== pos))
    setAvailable((p) => [...p, wordIndex])
  }

  async function doSubmit(indices: number[], elapsed: number): Promise<boolean> {
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId,
        submitted_answer: JSON.stringify(indices),
        time_taken_ms: elapsed,
      })
      onAnswered(result.points, JSON.stringify(indices))
      return true
    } catch {
      return false
    }
  }

  async function handleSubmit() {
    if (answered) return
    setAnswered(true)
    setSendError(false)
    if (!(await doSubmit(placed, now() - startRef.current))) {
      // Not recorded by the server: let the player submit again while time remains.
      setAnswered(false)
      setSendError(true)
    }
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    // Time is up, so there is no second chance: show 0 if the answer could not be sent.
    if (!(await doSubmit(placed, TIMER_MS.verse_scramble))) onAnswered(0, JSON.stringify(placed))
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-2 select-none [-webkit-touch-callout:none]">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-night/90 backdrop-blur flex justify-between items-center">
        <div>
          <p className="tag">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="font-display font-medium text-base mt-0.5">{content.reference}</p>
        </div>
        <Timer compact durationMs={Math.max(500, TIMER_MS.verse_scramble - elapsedMs)} onExpire={handleExpire} />
      </div>

      <div className="min-h-24 bg-ink border-2 border-dashed border-line rounded-2xl p-3 flex flex-wrap gap-2">
        {placed.length === 0 ? (
          <p className="text-faint text-sm font-semibold self-center mx-auto">Ketuk kata untuk menyusun ayat, geser untuk menukar urutan...</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={placed} strategy={rectSortingStrategy} disabled={answered}>
              {placed.map((wordIndex, pos) => (
                <PlacedWord
                  key={wordIndex}
                  id={wordIndex}
                  label={content.words[wordIndex]}
                  disabled={answered}
                  onRemove={() => remove(pos)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((wordIndex) => (
          <button
            key={wordIndex}
            onClick={() => tap(wordIndex)}
            disabled={answered}
            className="bg-raised border border-line px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform cursor-pointer disabled:opacity-30"
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-4 pb-4 mt-auto bg-gradient-to-t from-night from-60% to-transparent flex flex-col gap-2">
        {sendError && !answered && (
          <p role="alert" className="text-rose-300 text-xs font-semibold text-center">
            Jawaban belum terkirim. Periksa koneksi, lalu coba lagi.
          </p>
        )}

        {!answered ? (
          <button onClick={handleSubmit} disabled={placed.length === 0} className="btn-primary py-3 text-base w-full">
            Submit
          </button>
        ) : (
          <p className="text-center text-faint text-xs font-semibold animate-pulse">Menunggu soal berikutnya...</p>
        )}
      </div>
    </div>
  )
}
