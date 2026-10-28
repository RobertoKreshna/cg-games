'use client'
import { useEffect } from 'react'

/**
 * Keeps the screen on while `active`, so a phone does not sleep (and drop the connection) while
 * the player waits for the next question. Browsers release the lock whenever the tab is hidden,
 * so it is requested again when the tab becomes visible. Silently does nothing where the Screen
 * Wake Lock API is unsupported or refused (e.g. low battery): the game works the same without it.
 */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let pending = false
    let stopped = false

    async function acquire() {
      if (stopped || pending || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      pending = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (stopped) lock.release().catch(() => {})
        else sentinel = lock
      } catch {
        // Refused by the browser or device; nothing to do.
      } finally {
        pending = false
      }
    }

    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}
