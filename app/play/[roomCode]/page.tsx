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

  const [session, setSession] = useState<ReturnType<typeof getPlayerSession>>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('lobby')
  const [question, setQuestion] = useState<ActiveQuestion | null>(null)
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<unknown>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    const s = getPlayerSession(roomCode)
    setSession(s)
    setSessionReady(true)
    if (!s) return
    getRoomState(roomCode, s.sessionToken).then((data) => {
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
  }, [roomCode, router])

  const handleEvent = useCallback((e: GameEvent) => {
    if (e.event === 'game_started') {
      sessionIdRef.current = e.payload.session_id
    } else if (e.event === 'question_show') {
      setLastPoints(null)
      setSubmittedAnswer(null)
      setCorrectAnswer(null)
      setQuestion({
        questionId: e.payload.question_id,
        gameType: e.payload.game_type,
        content: e.payload.content,
        questionIndex: e.payload.question_index,
        totalQuestions: e.payload.total_questions,
      })
      setPhase('question')
    } else if (e.event === 'question_reveal') {
      setCorrectAnswer(e.payload.correct_answer)
      setPhase('reveal')
    } else if (e.event === 'game_finished') {
      router.push(`/results/${sessionIdRef.current ?? e.payload.session_id}`)
    }
  }, [router])

  useGameChannel(roomCode, handleEvent)

  if (!sessionReady) return null

  if (!session) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full">
          <p className="text-mist text-sm font-semibold">Session tidak ditemukan.</p>
          <a href="/join" className="text-gold text-sm font-bold underline underline-offset-4">
            Join ulang
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh flex flex-col">
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="card w-32 h-32 flex items-center justify-center text-5xl">
            <span className="animate-float inline-block">⏳</span>
          </div>
          <div className="text-center">
            <p className="font-display text-xl font-semibold">Menunggu host...</p>
            <p className="text-mist text-sm mt-1 font-semibold">Siap-siap ya! 🔥</p>
          </div>
          <div className="card px-5 py-2.5 flex items-center gap-2">
            <span className="tag">Room</span>
            <span className="font-display text-gold font-semibold tracking-widest text-xl">{roomCode}</span>
          </div>
        </div>
      )}

      {phase === 'question' && question && sessionIdRef.current && (
        <div className="flex-1 flex flex-col">
          {question.gameType === 'bible_quiz' && (
            <BibleQuiz
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as BibleQuizContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts, sub) => { setLastPoints(pts); setSubmittedAnswer(sub); setPhase((p) => p === 'reveal' ? p : 'answered') }}
            />
          )}
          {question.gameType === 'verse_scramble' && (
            <VerseScramble
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as VerseScrambleContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts, sub) => { setLastPoints(pts); setSubmittedAnswer(sub); setPhase((p) => p === 'reveal' ? p : 'answered') }}
            />
          )}
          {question.gameType === 'emoji_story' && (
            <EmojiStory
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as EmojiStoryContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts, sub) => { setLastPoints(pts); setSubmittedAnswer(sub); setPhase((p) => p === 'reveal' ? p : 'answered') }}
            />
          )}
        </div>
      )}

      {(phase === 'answered' || phase === 'reveal') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          {lastPoints !== null ? (
            <>
              <div className="text-6xl animate-pop-in">
                {lastPoints >= 800 ? '🎉' : lastPoints >= 500 ? '🔥' : lastPoints > 0 ? '👍' : '😅'}
              </div>
              <div className="card px-10 py-6 flex flex-col items-center gap-1 text-center animate-pop-in">
                <span className="font-display text-5xl font-semibold text-gold tabular-nums">+{lastPoints}</span>
                <span className="tag">poin</span>
              </div>
            </>
          ) : (
            <div className="card p-8 flex flex-col items-center gap-2 text-center">
              <p className="text-mist text-sm font-semibold">Menunggu soal berikutnya...</p>
            </div>
          )}

          {phase === 'reveal' && correctAnswer != null && question && (() => {
            if (question.gameType === 'bible_quiz') {
              const correct = correctAnswer as number
              const submitted = submittedAnswer !== null ? parseInt(submittedAnswer) : -1
              const c = question.content as BibleQuizContent
              return (
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {c.options.map((opt, i) => {
                    const isCorrect = i === correct
                    const isWrong = submitted >= 0 && i === submitted && i !== correct
                    return (
                      <div key={i} className={`px-3 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                        isCorrect ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200'
                        : isWrong ? 'bg-rose-400/15 border-rose-400/60 text-rose-200'
                        : 'bg-white/5 border-line text-faint'
                      }`}>
                        <span className="text-xs font-bold w-4 shrink-0">{['A','B','C','D'][i]}</span>
                        <span className="flex-1">{opt}</span>
                        {isCorrect && <span className="text-emerald-300 text-xs">✓</span>}
                        {isWrong && <span className="text-rose-300 text-xs">✗</span>}
                      </div>
                    )
                  })}
                </div>
              )
            }

            if (question.gameType === 'verse_scramble') {
              const correct = Array.isArray(correctAnswer) ? correctAnswer as number[] : []
              const submitted = submittedAnswer ? JSON.parse(submittedAnswer) as number[] : []
              const c = question.content as VerseScrambleContent
              return (
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  {submitted.length > 0 && (
                    <div>
                      <p className="tag mb-1.5">Jawabanmu</p>
                      <div className="flex flex-wrap gap-1.5">
                        {submitted.map((wi, pos) => (
                          <span key={pos} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            correct[pos] === wi ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'
                          }`}>{c.words[wi]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="tag mb-1.5">Urutan Benar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {correct.map((wi, pos) => (
                        <span key={pos} className="bg-emerald-400/20 text-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                          {c.words[wi]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            }

            if (question.gameType === 'emoji_story') {
              const correct = Array.isArray(correctAnswer) ? correctAnswer as number[] : []
              const submitted = submittedAnswer ? JSON.parse(submittedAnswer) as number[] : []
              const c = question.content as EmojiStoryContent
              return (
                <div className="grid grid-cols-2 gap-1.5 w-full max-w-xs">
                  {c.words.map((word, i) => {
                    const isSelected = submitted.includes(i)
                    const isCorrect = correct.includes(i)
                    const cls = isSelected && isCorrect ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/60'
                      : isSelected && !isCorrect ? 'bg-rose-400/15 text-rose-200 border-rose-400/60'
                      : !isSelected && isCorrect ? 'bg-white/5 text-emerald-300 border-emerald-400/60'
                      : 'bg-white/5 text-faint border-line'
                    return (
                      <div key={i} className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${cls}`}>
                        <span>{word}</span>
                        {isSelected && isCorrect && <span>✓</span>}
                        {isSelected && !isCorrect && <span>✗</span>}
                        {!isSelected && isCorrect && <span>✓</span>}
                      </div>
                    )
                  })}
                </div>
              )
            }

            return null
          })()}

          <p className="text-faint text-xs font-semibold animate-pulse">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
