import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HostQuestionCard } from '@/components/shared/HostQuestionCard'

const quiz = { gameType: 'bible_quiz' as const, content: { question: 'Dari apa Allah membuat tubuh Adam?', options: ['Air', 'Debu tanah', 'Kayu', 'Batu'], reference: 'Kejadian 2:7' } }
const verse = { gameType: 'verse_scramble' as const, content: { reference: 'Yohanes 3:16', words: ['Allah', 'kasih', 'Karena', 'dunia'] } }
const story = { gameType: 'emoji_story' as const, content: { emojis: '🐟🍞', hint: 'Mukjizat', words: ['Lima roti', 'Badai', 'Dua ikan', 'Kain'] } }

describe('HostQuestionCard', () => {
  it('bible quiz: shows the question and options but not the answer or reference before the reveal', () => {
    render(<HostQuestionCard question={quiz} correctAnswer={1} revealed={false} />)
    expect(screen.getByText('Dari apa Allah membuat tubuh Adam?')).toBeTruthy()
    expect(screen.getByText('Debu tanah')).toBeTruthy()
    expect(screen.queryByLabelText('jawaban benar')).toBeNull()
    expect(screen.queryByText(/Kejadian 2:7/)).toBeNull()
  })

  it('bible quiz: marks the correct option (including index 0) and shows the reference after the reveal', () => {
    const { unmount } = render(<HostQuestionCard question={quiz} correctAnswer={1} revealed />)
    expect(screen.getAllByLabelText('jawaban benar').length).toBe(1)
    expect(screen.getByLabelText('jawaban benar').parentElement?.textContent).toContain('Debu tanah')
    expect(screen.getByText(/Kejadian 2:7/)).toBeTruthy()
    unmount()
    render(<HostQuestionCard question={quiz} correctAnswer={0} revealed />)
    expect(screen.getByLabelText('jawaban benar').parentElement?.textContent).toContain('Air')
  })

  it('verse scramble: hides the verse until the reveal, then assembles it in the correct order', () => {
    const { unmount } = render(<HostQuestionCard question={verse} correctAnswer={[2, 1, 0, 3]} revealed={false} />)
    expect(screen.getByText('Yohanes 3:16')).toBeTruthy()
    expect(screen.getByText('4 kata diacak')).toBeTruthy()
    expect(screen.queryByText('Karena kasih Allah dunia')).toBeNull()
    unmount()
    render(<HostQuestionCard question={verse} correctAnswer={[2, 1, 0, 3]} revealed />)
    expect(screen.getByText('Karena kasih Allah dunia')).toBeTruthy()
  })

  it('emoji story: shows the emojis and hint, and the correct words only after the reveal', () => {
    const { unmount } = render(<HostQuestionCard question={story} correctAnswer={[0, 2]} revealed={false} />)
    expect(screen.getByText('🐟🍞')).toBeTruthy()
    expect(screen.getByText('Mukjizat')).toBeTruthy()
    expect(screen.queryByText('Lima roti')).toBeNull()
    unmount()
    render(<HostQuestionCard question={story} correctAnswer={[0, 2]} revealed />)
    expect(screen.getByText('Lima roti')).toBeTruthy()
    expect(screen.getByText('Dua ikan')).toBeTruthy()
    expect(screen.queryByText('Badai')).toBeNull()
  })

  it('tolerates missing or malformed data without crashing', () => {
    render(<HostQuestionCard question={{ gameType: 'bible_quiz', content: {} }} correctAnswer={null} revealed />)
    render(<HostQuestionCard question={{ gameType: 'verse_scramble', content: { words: 'nope' } }} correctAnswer="x" revealed />)
    render(<HostQuestionCard question={{ gameType: 'emoji_story', content: { words: [1, 2] } }} correctAnswer={{}} revealed />)
    expect(true).toBe(true)
  })
})

const memory = {
  gameType: 'memory_match' as const,
  content: {
    cols: 3, hideMs: 1000, timerMs: 80_000,
    cards: [
      { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
      { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
    ],
    quiz: [
      { pair: 0, options: ['Karena begitu besar kasih Allah', 'b', 'c', 'd'], answer: 0 },
      { pair: 1, options: ['a', 'TUHAN adalah gembalaku', 'c', 'd'], answer: 1 },
    ],
  },
}

describe('HostQuestionCard: memory match', () => {
  it('summarises the board before the reveal without showing verses', () => {
    render(<HostQuestionCard question={memory} correctAnswer={null} revealed={false} />)
    expect(screen.getByText(/Memory Ayat/)).toBeTruthy()
    expect(screen.getByText(/2 pasang/)).toBeTruthy()
    expect(screen.getByText(/4 kartu/)).toBeTruthy()
    expect(screen.queryByText('TUHAN adalah gembalaku')).toBeNull()
  })

  it('lists every verse with its text after the reveal', () => {
    render(<HostQuestionCard question={memory} correctAnswer={[0, 1]} revealed />)
    expect(screen.getByText('Yohanes 3:16')).toBeTruthy()
    expect(screen.getByText('Karena begitu besar kasih Allah')).toBeTruthy()
    expect(screen.getByText('Mazmur 23:1')).toBeTruthy()
    expect(screen.getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })

  it('tolerates a board with no data', () => {
    render(<HostQuestionCard question={{ gameType: 'memory_match', content: {} }} correctAnswer={null} revealed />)
    expect(screen.getByText(/Memory Ayat/)).toBeTruthy()
  })
})
