'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameChannel, type GameEvent } from '@/lib/realtime'
import { getRoomState } from '@/lib/api'
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

  useEffect(() => {
    if (!session) return
    getRoomState(roomCode, session.sessionToken).then((data) => {
      if (data.session_id) sessionIdRef.current = data.session_id
      if (data.phase === 'finished') {
        router.push(`/results/${data.session_id}`)
      } else if (data.current_question) {
        setQuestion({
          questionId: data.current_question.question_id,
          gameType: data.current_question.game_type,
          content: data.current_question.content,
          questionIndex: data.current_question.question_index,
          totalQuestions: data.current_question.total_questions,
        })
        if (data.points !== null) setLastPoints(data.points)
        setPhase(data.phase)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <main className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full">
          <p className="text-[#999] text-sm">Session tidak ditemukan.</p>
          <a href="/join" className="text-[#111] text-sm font-semibold underline underline-offset-4">
            Join ulang
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="card w-32 h-32 flex items-center justify-center text-4xl animate-pulse">
            ⏳
          </div>
          <div className="text-center">
            <p className="text-[#111] font-semibold">Menunggu host...</p>
            <p className="text-[#999] text-sm mt-1">Siap-siap ya!</p>
          </div>
          <div className="card px-5 py-2.5 flex items-center gap-2">
            <span className="tag">Room</span>
            <span className="text-[#111] font-bold tracking-widest text-lg">{roomCode}</span>
          </div>
        </div>
      )}

      {phase === 'question' && question && sessionIdRef.current && (
        <div className="flex-1 flex flex-col">
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
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          {lastPoints !== null ? (
            <>
              <div className="text-6xl">
                {lastPoints >= 800 ? '🎉' : lastPoints >= 500 ? '🔥' : lastPoints > 0 ? '👍' : '😅'}
              </div>
              <div className="card px-10 py-6 flex flex-col items-center gap-1 text-center">
                <span className="text-4xl font-bold text-[#111]">+{lastPoints}</span>
                <span className="text-[#999] text-xs uppercase tracking-wider">poin</span>
              </div>
            </>
          ) : (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <p className="text-[#999] text-sm">Menunggu soal berikutnya...</p>
            </div>
          )}
          <p className="text-[#CCC] text-xs animate-pulse">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
