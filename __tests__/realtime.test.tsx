import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { ConnectionBanner } from '@/components/shared/ConnectionBanner'

type StatusCb = (status: string) => void
interface FakeChannel {
  state: string
  cb: StatusCb | null
  on: ReturnType<typeof vi.fn>
  subscribe: (cb: StatusCb) => FakeChannel
  unsubscribe: ReturnType<typeof vi.fn>
}

const channels: FakeChannel[] = []
const syncClose = { value: false }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: FakeChannel = {
        state: 'closed',
        cb: null,
        on: vi.fn(() => ch),
        subscribe(cb) { ch.cb = cb; return ch },
        // A real unsubscribe reports CLOSED; some paths do it synchronously.
        unsubscribe: vi.fn(() => { ch.state = 'closed'; if (syncClose.value) ch.cb?.('CLOSED') }),
      }
      channels.push(ch)
      return ch
    }),
  },
}))

import { useGameChannel } from '@/lib/realtime'

const emit = (ch: FakeChannel, status: string) => act(() => { ch.state = status === 'SUBSCRIBED' ? 'joined' : 'closed'; ch.cb?.(status) })

describe('useGameChannel connection status', () => {
  beforeEach(() => { channels.length = 0; syncClose.value = false; vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('goes connecting -> connected, and does not resync on the first connect', () => {
    const onResync = vi.fn()
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn(), onResync))
    expect(result.current).toBe('connecting')
    emit(channels[0], 'SUBSCRIBED')
    expect(result.current).toBe('connected')
    expect(onResync).not.toHaveBeenCalled()
  })

  it('reports disconnected on error, retries after 2s, then resyncs once reconnected', () => {
    const onResync = vi.fn()
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn(), onResync))
    emit(channels[0], 'SUBSCRIBED')
    emit(channels[0], 'CHANNEL_ERROR')
    expect(result.current).toBe('disconnected')
    expect(channels.length).toBe(1)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(channels.length).toBe(2)
    emit(channels[1], 'SUBSCRIBED')
    expect(result.current).toBe('connected')
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('a late CLOSED from a replaced channel does not flip the status back', () => {
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn()))
    emit(channels[0], 'SUBSCRIBED')
    emit(channels[0], 'TIMED_OUT')
    act(() => { vi.advanceTimersByTime(2000) })
    emit(channels[1], 'SUBSCRIBED')
    emit(channels[0], 'CLOSED')
    expect(result.current).toBe('connected')
    expect(channels.length).toBe(2)
  })

  it('does not loop or open extra channels when unsubscribe reports CLOSED synchronously', () => {
    syncClose.value = true
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn()))
    emit(channels[0], 'SUBSCRIBED')
    emit(channels[0], 'CHANNEL_ERROR')
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(channels.length).toBe(2)
    emit(channels[1], 'SUBSCRIBED')
    expect(result.current).toBe('connected')
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(channels.length).toBe(2)
  })

  it('browser offline marks it disconnected; coming back online reconnects', () => {
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn()))
    emit(channels[0], 'SUBSCRIBED')
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe('disconnected')
    channels[0].state = 'closed'
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(channels.length).toBe(2)
    expect(channels[0].unsubscribe).toHaveBeenCalled()
  })

  it('a short outage that never dropped the socket recovers on online: connected again and resynced', () => {
    const onResync = vi.fn()
    const { result } = renderHook(() => useGameChannel('ABC123', vi.fn(), onResync))
    emit(channels[0], 'SUBSCRIBED')
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe('disconnected')
    expect(channels[0].state).toBe('joined') // socket still looks alive
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toBe('connected')
    expect(onResync).toHaveBeenCalledTimes(1)
    expect(channels.length).toBe(1)
  })

  it('stops retrying after unmount', () => {
    const { unmount } = renderHook(() => useGameChannel('ABC123', vi.fn()))
    emit(channels[0], 'SUBSCRIBED')
    emit(channels[0], 'CHANNEL_ERROR')
    unmount()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(channels.length).toBe(1)
  })
})

describe('ConnectionBanner', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stays hidden for brief drops and shows after a sustained disconnect', () => {
    const { rerender } = render(<ConnectionBanner status="connected" />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<ConnectionBanner status="disconnected" />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getByRole('status').textContent).toContain('Koneksi terputus')
  })

  it('never shows if the connection comes back within the delay, and hides when it does later', () => {
    const { rerender } = render(<ConnectionBanner status="disconnected" />)
    act(() => { vi.advanceTimersByTime(1500) })
    rerender(<ConnectionBanner status="connected" />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByRole('status')).toBeNull()

    rerender(<ConnectionBanner status="disconnected" />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<ConnectionBanner status="connected" />)
    act(() => { vi.advanceTimersByTime(10) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not warn while the first connection is still being made', () => {
    render(<ConnectionBanner status="connecting" />)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
