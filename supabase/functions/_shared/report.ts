// Sends server errors to a Discord webhook. Best effort: it never throws and does nothing when
// DISCORD_WEBHOOK_URL is not set, so it cannot break a request.

const recent = new Map<string, number>()
const DEDUPE_MS = 60_000

export async function reportError(source: string, error: unknown, req?: Request): Promise<void> {
  try {
    const hook = Deno.env.get('DISCORD_WEBHOOK_URL')
    if (!hook) return

    const err = error instanceof Error ? error : new Error(String(error))
    const key = `${source}:${err.message}`
    const now = Date.now()
    if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return
    recent.set(key, now)
    if (recent.size > 100) recent.clear()

    // Path only: query strings and headers can carry tokens.
    const where = req ? `${req.method} ${new URL(req.url).pathname}` : undefined
    const detail = (err.stack ?? err.message).slice(0, 1500)

    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: `🚨 ${source}`,
          description: '```\n' + detail.replaceAll('```', "'''") + '\n```',
          color: 0xe11d48,
          fields: where ? [{ name: 'Request', value: where }] : [],
          timestamp: new Date().toISOString(),
        }],
      }),
    })
  } catch {
    // Reporting must never affect the request.
  }
}
