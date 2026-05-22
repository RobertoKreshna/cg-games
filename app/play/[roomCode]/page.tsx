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
      <main className="min-h-screen flex items-center justify-center bg-blue-700">
        <div className="text-center text-white">
          <p className="mb-4">Session tidak ditemukan.</p>
          <a href="/join" className="underline">Join ulang</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-blue-600 to-purple-700 flex flex-col">
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="text-6xl animate-bounce">⏳</div>
          <p className="text-white text-xl font-semibold">Menunggu host mulai...</p>
          <p className="text-blue-200">Kode: {roomCode}</p>
        </div>
      )}

      {phase === 'question' && question && sessionIdRef.current && (
        <>
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
        </>
      )}

      {(phase === 'answered' || phase === 'reveal') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {lastPoints !== null ? (
            <>
              <div className="text-7xl">{lastPoints >= 500 ? '🎉' : lastPoints > 0 ? '👍' : '😅'}</div>
              <p className="text-white text-4xl font-bold">+{lastPoints}</p>
              <p className="text-blue-200">poin</p>
            </>
          ) : (
            <p className="text-white text-xl">Menunggu soal berikutnya...</p>
          )}
          <p className="text-white/50 text-sm animate-pulse mt-4">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
