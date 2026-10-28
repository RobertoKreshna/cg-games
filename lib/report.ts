// Sends browser-side errors to /api/report, which forwards them to Discord. Best effort: it never
// throws, and repeats of the same error are dropped so a render loop cannot flood the channel.

const MAX_PER_PAGE = 5
const sent = new Set<string>()

export function reportClientError(context: string, error: unknown) {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const key = `${context}:${err.message}`
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return
    sent.add(key)

    const body = JSON.stringify({
      context,
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 1500),
      path: location.pathname,
    })
    if (navigator.sendBeacon?.('/api/report', new Blob([body], { type: 'application/json' }))) return
    fetch('/api/report', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
  } catch {
    // Reporting must never break the app.
  }
}
