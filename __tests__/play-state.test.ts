import { describe, it, expect } from 'vitest'
import { applyServerState, INITIAL, type GameState, type ServerState } from '@/lib/play-state'

const q = (id: string, extra: Partial<NonNullable<ServerState['current_question']>> = {}) => ({
  question_id: id, game_type: 'bible_quiz' as const, content: { question: 'q', options: ['a'] } as never,
  question_index: 0, total_questions: 3, ...extra,
})
const state = (over: Partial<GameState> = {}): GameState => ({ ...INITIAL, ...over })

describe('applyServerState', () => {
  it('loads a question with the elapsed time from the server', () => {
    const out = applyServerState(INITIAL, { phase: 'question', session_id: 's1', current_question: q('a'), elapsed_ms: 4200 })
    expect(out.phase).toBe('question')
    expect(out.sessionId).toBe('s1')
    expect(out.question?.questionId).toBe('a')
    expect(out.question?.elapsedMs).toBe(4200)
  })

  it('never moves backwards for the same question (late response after the reveal)', () => {
    const prev = state({ phase: 'reveal', sessionId: 's1', question: { questionId: 'a', gameType: 'bible_quiz', content: {} as never, questionIndex: 0, totalQuestions: 3, elapsedMs: 0 }, correctAnswer: 1 })
    const out = applyServerState(prev, { phase: 'answered', session_id: 's1', current_question: q('a') })
    expect(out.phase).toBe('reveal')
    expect(out.correctAnswer).toBe(1)
  })

  it('takes the server phase when the question changed', () => {
    const prev = state({ phase: 'reveal', question: { questionId: 'a', gameType: 'bible_quiz', content: {} as never, questionIndex: 0, totalQuestions: 3, elapsedMs: 0 }, lastPoints: 800, standings: { mode: 'individual', entries: [] } })
    const out = applyServerState(prev, { phase: 'question', current_question: q('b', { question_index: 1 }) })
    expect(out.phase).toBe('question')
    expect(out.question?.questionId).toBe('b')
    expect(out.lastPoints).toBeNull()
    expect(out.standings).toBeNull()
  })

  it('restores reveal data (answer, points, standings) after a refresh', () => {
    const standings = { mode: 'individual' as const, entries: [{ id: 'p', name: 'Ann', points: 900 }] }
    const out = applyServerState(INITIAL, { phase: 'reveal', session_id: 's', current_question: q('a'), points: 900, submitted_answer: '1', correct_answer: 1, standings })
    expect(out).toMatchObject({ phase: 'reveal', lastPoints: 900, submittedAnswer: '1', correctAnswer: 1, standings })
  })

  it('keeps the team and session when the room is still in the lobby', () => {
    const out = applyServerState(INITIAL, { phase: 'lobby', session_id: 's9', team: { id: 't', name: 'Tim Biru', color: '#00f' } })
    expect(out.phase).toBe('lobby')
    expect(out.sessionId).toBe('s9')
    expect(out.team?.name).toBe('Tim Biru')
  })

  it('does not wipe a known team when the server omits it', () => {
    const prev = state({ team: { id: 't', name: 'Tim Biru', color: '#00f' } })
    expect(applyServerState(prev, { phase: 'lobby' }).team?.id).toBe('t')
  })

  it('keeps the lobby player list from the server and does not wipe it when a later response omits it', () => {
    const withPlayers = applyServerState(INITIAL, { phase: 'lobby', players: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Budi' }] })
    expect(withPlayers.lobbyPlayers.map((p) => p.name)).toEqual(['Ana', 'Budi'])
    const later = applyServerState(withPlayers, { phase: 'question', current_question: q('a') })
    expect(later.lobbyPlayers.length).toBe(2)
  })

  it('a closed room ends the session without a question', () => {
    const out = applyServerState(INITIAL, { phase: 'closed' })
    expect(out.ended).toBe('closed')
  })

  it('an ended state is not cleared by a later server snapshot', () => {
    const ended = { ...INITIAL, ended: 'kicked' as const }
    expect(applyServerState(ended, { phase: 'question', current_question: q('a') }).ended).toBe('kicked')
  })
})
