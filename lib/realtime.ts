'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BibleQuizContent, EmojiStoryContent, GameType, Standings, VerseScrambleContent } from '@/types/game'

export type GameEvent =
  | { event: 'player_joined'; payload: { name: string; player_id: string } }
  | { event: 'teams_assigned'; payload: { teams: Array<{ id: string; name: string; color: string; members: Array<{ id: string; name: string }> }> } }
  | { event: 'game_started'; payload: { session_id: string } }
  | { event: 'question_show'; payload: { session_id: string; question_index: number; question_id: string; game_type: GameType; content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent; total_questions: number } }
  | { event: 'player_answered'; payload: { player_id: string; name: string } }
  | { event: 'question_reveal'; payload: { question_id: string; correct_answer: unknown; standings?: Standings | null } }
  | { event: 'game_finished'; payload: { session_id: string } }
  | { event: 'player_kicked'; payload: { player_id: string } }
  | { event: 'room_closed'; payload: Record<string, never> }

const EVENTS: GameEvent['event'][] = [
  'player_joined', 'teams_assigned', 'game_started',
  'question_show', 'player_answered', 'question_reveal', 'game_finished',
  'player_kicked', 'room_closed',
]

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Subscribes to a room's broadcast channel and reports whether it is connected.
 *
 * Broadcasts are not replayed, so anything sent while the phone was offline or backgrounded is
 * lost. `onResync` fires after every reconnect and whenever the tab becomes visible again, so
 * the caller can re-fetch authoritative state from the server.
 */
export function useGameChannel(
  roomCode: string | null,
  onEvent: (e: GameEvent) => void,
  onResync?: () => void,
): ConnectionStatus {
  const onEventRef = useRef(onEvent)
  const onResyncRef = useRef(onResync)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
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
      const ch = supabase.channel(`room:${roomCode}`, {
        config: { broadcast: { self: false } },
      })
      channel = ch
      EVENTS.forEach((event) => {
        ch.on('broadcast', { event }, ({ payload }) => {
          onEventRef.current({ event, payload } as GameEvent)
        })
      })
      ch.subscribe((state) => {
        // Ignore callbacks from a channel we already replaced (its CLOSED arrives late).
        if (!mounted || channel !== ch) return
        if (state === 'SUBSCRIBED') {
          setStatus('connected')
          // The very first connect has nothing to catch up on; later ones do.
          if (hasConnected) onResyncRef.current?.()
          hasConnected = true
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          setStatus('disconnected')
          // Detach first: unsubscribing reports CLOSED, which must not trigger another retry.
          channel = null
          ch.unsubscribe()
          if (retryTimeout) clearTimeout(retryTimeout)
          retryTimeout = setTimeout(connect, 2000)
        }
      })
    }

    function reconnect() {
      const old = channel
      channel = null
      old?.unsubscribe()
      if (retryTimeout) clearTimeout(retryTimeout)
      connect()
    }

    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (channel?.state !== 'joined') {
        reconnect()
      } else {
        // Still connected, but the phone may have been asleep and missed events.
        onResyncRef.current?.()
      }
    }

    // The browser knows before the socket times out.
    function handleOffline() {
      setStatus('disconnected')
    }
    function handleOnline() {
      if (channel?.state === 'joined') {
        // A short outage may not have dropped the socket. Events sent meanwhile are lost, so resync;
        // if the socket is in fact dead its heartbeat will fail and the retry path takes over.
        setStatus('connected')
        onResyncRef.current?.()
      } else {
        reconnect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      mounted = false
      if (retryTimeout) clearTimeout(retryTimeout)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      channel?.unsubscribe()
    }
  }, [roomCode])

  return status
}
