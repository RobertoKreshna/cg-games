import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWakeLock } from '@/lib/wake-lock'

function sentinel() {
  return { released: false, release: vi.fn(async function (this: { released: boolean }) { this.released = true }) }
}
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useWakeLock', () => {
  let request: ReturnType<typeof vi.fn>
  beforeEach(() => {
    request = vi.fn(async () => sentinel())
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => { delete (navigator as unknown as Record<string, unknown>).wakeLock })

  it('requests a screen lock on mount and releases it on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(request).toHaveBeenCalledWith('screen')
    const lock = await request.mock.results[0].value
    unmount()
    expect(lock.release).toHaveBeenCalled()
  })

  it('does nothing when inactive or while the tab is hidden', async () => {
    renderHook(() => useWakeLock(false))
    await flush()
    expect(request).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    renderHook(() => useWakeLock(true))
    await flush()
    expect(request).not.toHaveBeenCalled()
  })

  it('requests again after the browser released the lock and the tab is visible again', async () => {
    renderHook(() => useWakeLock(true))
    await flush()
    const first = await request.mock.results[0].value
    first.released = true // browser drops it when the tab is hidden
    setVisibility('hidden')
    setVisibility('visible')
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not stack requests while one is pending or a lock is still held', async () => {
    renderHook(() => useWakeLock(true))
    setVisibility('visible')
    setVisibility('visible')
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('releases a lock that arrives after unmount', async () => {
    let resolve!: (s: ReturnType<typeof sentinel>) => void
    request.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const { unmount } = renderHook(() => useWakeLock(true))
    unmount()
    const late = sentinel()
    resolve(late)
    await flush()
    expect(late.release).toHaveBeenCalled()
  })

  it('swallows refusals and works where the API is missing', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
    await flush()
    delete (navigator as unknown as Record<string, unknown>).wakeLock
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
  })
})
