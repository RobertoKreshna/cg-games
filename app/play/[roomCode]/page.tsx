'use client'
import { useCallback, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import { getPlayerSession } from '@/lib/tokens'
import { BibleQuiz } from '@/components/games/BibleQuiz'
import { VerseScramble } from '@/components/games/VerseScramble'
import { EmojiStory } from '@/components/games/EmojiStory'
import type { BibleQuizContent, EmojiStoryContent, GameType, VerseScrambleContent } from '@/types/game'

type Phase = 'lobby' | 'question' | 'answered' | 'reveal'

interface ActiveQuestion {
  questionId: string
  gameType: GameType
  content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent
  questionIndex: number
  totalQuestions: number
}

export default function PlayPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const router = useRouter()
  const session = getPlayerSession(roomCode)

  const [phase, setPhase] = useState<Phase>('lobby')
  const [question, setQuestion] = useState<ActiveQuestion | null>(null)
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.event === 'game_started') {
      sessionIdRef.current = e.payload.session_id
    } else if (e.event === 'question_show') {
      setLastPoints(null)
      setQuestion({
        questionId: e.payload.question_id,
        gameType: e.payload.game_type,
        content: e.payload.content,
        questionIndex: e.payload.question_index,
        totalQuestions: e.payload.total_questions,
      })
      setPhase('question')
    } else if (e.event === 'question_reveal') {
      setPhase('reveal')
    } else if (e.event === 'game_finished') {
      router.push(`/results/${sessionIdRef.current}`)
    }
  }, [router])

  useGameChannel(roomCode, handleEvent)

  if (!session) {
    return (
      <main className="app-bg grid-bg min-h-screen flex items-center justify-center p-6">
        <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
          <div className="text-4xl">🔒</div>
          <p className="text-white/70">Session tidak ditemukan.</p>
          <a href="/join" className="text-gold text-sm font-semibold underline underline-offset-4">
            Join ulang
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="app-bg grid-bg min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-56 rounded-full bg-violet-700/15 blur-3xl pointer-events-none" />

      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 relative z-10">
          <div className="glass-card w-36 h-36 flex flex-col items-center justify-center gap-1">
            <div className="text-5xl animate-pulse">⏳</div>
          </div>
          <div className="text-center">
            <p className="heading text-xl text-white mb-1">Menunggu host...</p>
            <p className="text-white/35 text-sm">Siap-siap ya!</p>
          </div>
          <div className="glass-card-sm px-5 py-2.5 flex items-center gap-2">
            <span className="text-white/35 text-xs uppercase tracking-wider">Room</span>
            <span className="heading text-gold text-xl tracking-widest">{roomCode}</span>
          </div>
        </div>
      )}

      {phase === 'question' && question && sessionIdRef.current && (
        <div className="flex-1 flex flex-col relative z-10">
          {question.gameType === 'bible_quiz' && (
            <BibleQuiz
              questionId={question.questionId}
              content={question.content as BibleQuizContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
          {question.gameType === 'verse_scramble' && (
            <VerseScramble
              questionId={question.questionId}
              content={question.content as VerseScrambleContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
          {question.gameType === 'emoji_story' && (
            <EmojiStory
              questionId={question.questionId}
              content={question.content as EmojiStoryContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
        </div>
      )}

      {(phase === 'answered' || phase === 'reveal') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 relative z-10">
          {lastPoints !== null ? (
            <>
              <div className="text-7xl">
                {lastPoints >= 800 ? '🎉' : lastPoints >= 500 ? '🔥' : lastPoints > 0 ? '👍' : '😅'}
              </div>
              <div className="glass-card px-10 py-6 flex flex-col items-center gap-1">
                <span className="heading text-5xl font-black text-gold">+{lastPoints}</span>
                <span className="text-white/35 text-sm uppercase tracking-wider">poin</span>
              </div>
            </>
          ) : (
            <div className="glass-card p-8 flex flex-col items-center gap-2">
              <div className="text-3xl animate-pulse">⏳</div>
              <p className="text-white/70 font-semibold">Menunggu soal berikutnya...</p>
            </div>
          )}
          <p className="text-white/25 text-xs animate-pulse mt-2">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
