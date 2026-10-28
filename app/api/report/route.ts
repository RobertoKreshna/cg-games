// Forwards browser errors to a Discord webhook. The webhook URL stays on the server; the browser
// only ever talks to this route.

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const recent = new Map<string, number>()
let windowStart = 0
let windowCount = 0

function allowed(key: string): boolean {
  const now = Date.now()
  if (now - windowStart > WINDOW_MS) {
    windowStart = now
    windowCount = 0
  }
  if (windowCount >= MAX_PER_WINDOW) return false
  if ((recent.get(key) ?? 0) > now - WINDOW_MS) return false
  windowCount++
  recent.set(key, now)
  if (recent.size > 100) recent.clear()
  return true
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export async function POST(request: Request) {
  const hook = process.env.DISCORD_WEBHOOK_URL
  if (!hook) return new Response(null, { status: 204 })

  // Browsers always send Origin on POST; this only stops other sites from using the endpoint.
  const origin = request.headers.get('origin')
  if (!origin || new URL(origin).host !== request.headers.get('host')) {
    return new Response(null, { status: 403 })
  }

  const raw = await request.text()
  if (raw.length > 4000) return new Response(null, { status: 413 })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }

  const context = text(body.context, 80) || 'client'
  const message = text(body.message, 500) || 'unknown error'
  if (!allowed(`${context}:${message}`)) return new Response(null, { status: 204 })

  const detail = (text(body.stack, 1500) || message).replaceAll('```', "'''")
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: `🖥️ ${context}`,
          description: '```\n' + detail + '\n```',
          color: 0xf59e0b,
          fields: [{ name: 'Page', value: text(body.path, 200) || '/' }],
          timestamp: new Date().toISOString(),
        }],
      }),
    })
  } catch {
    // Nothing useful to do if Discord is down.
  }
  return new Response(null, { status: 204 })
}
