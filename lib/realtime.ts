'use client'
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BibleQuizContent, EmojiStoryContent, GameType, VerseScrambleContent } from '@/types/game'

export type GameEvent =
  | { event: 'player_joined'; payload: { name: string; player_id: string } }
  | { event: 'teams_assigned'; payload: { teams: Array<{ id: string; name: string; color: string; members: Array<{ id: string; name: string }> }> } }
  | { event: 'game_started'; payload: { session_id: string } }
  | { event: 'question_show'; payload: { session_id: string; question_index: number; question_id: string; game_type: GameType; content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent; total_questions: number } }
  | { event: 'player_answered'; payload: { player_id: string; name: string } }
  | { event: 'question_reveal'; payload: { question_id: string; correct_answer: unknown } }
  | { event: 'game_finished'; payload: { session_id: string } }

const EVENTS: GameEvent['event'][] = [
  'player_joined', 'teams_assigned', 'game_started',
  'question_show', 'player_answered', 'question_reveal', 'game_finished',
]

/**
 * Subscribes to a room's broadcast channel.
 *
 * Broadcasts are not replayed, so anything sent while the phone was offline or backgrounded is
 * lost. `onResync` fires after every reconnect and whenever the tab becomes visible again, so
 * the caller can re-fetch authoritative state from the server.
 */
export function useGameChannel(
  roomCode: string | null,
  onEvent: (e: GameEvent) => void,
  onResync?: () => void,
) {
  const onEventRef = useRef(onEvent)
  const onResyncRef = useRef(onResync)
  useEffect(() => {
    onEventRef.current = onEvent
    onResyncRef.current = onResync
  })

  useEffect(() => {
    if (!roomCode) return

    let channel: RealtimeChannel | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let mounted = true
    let hasConnected = false

    function connect() {
      channel = supabase.channel(`room:${roomCode}`, {
        config: { broadcast: { self: false } },
      })
      EVENTS.forEach((event) => {
        channel!.on('broadcast', { event }, ({ payload }) => {
          onEventRef.current({ event, payload } as GameEvent)
        })
      })
      channel.subscribe((status) => {
        if (!mounted) return
        if (status === 'SUBSCRIBED') {
          // The very first connect has nothing to catch up on; later ones do.
          if (hasConnected) onResyncRef.current?.()
          hasConnected = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          channel?.unsubscribe()
          retryTimeout = setTimeout(connect, 2000)
        }
      })
    }

    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (channel?.state !== 'joined') {
        channel?.unsubscribe()
        if (retryTimeout) clearTimeout(retryTimeout)
        connect()
      } else {
        // Still connected, but the phone may have been asleep and missed events.
        onResyncRef.current?.()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      if (retryTimeout) clearTimeout(retryTimeout)
      document.removeEventListener('visibilitychange', handleVisibility)
      channel?.unsubscribe()
    }
  }, [roomCode])
}
