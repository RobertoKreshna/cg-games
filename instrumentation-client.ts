import { reportClientError } from '@/lib/report'

// Browser noise that is not actionable.
const IGNORED = /ResizeObserver loop|Script error\.?$|Load failed|Failed to fetch|NetworkError/i

window.addEventListener('error', (event) => {
  if (IGNORED.test(event.message)) return
  reportClientError('window.error', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (IGNORED.test(reason instanceof Error ? reason.message : String(reason))) return
  reportClientError('unhandledrejection', reason)
})
