import { reportError } from './report.ts'

/** Publishes an event to everyone in a room. */
export async function broadcastToRoom(roomCode: string, event: string, payload: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const topic = `room:${roomCode}`
  const body = JSON.stringify({ messages: [{ topic, event, payload }] })

  // One retry: a dropped broadcast leaves every phone stuck on the previous screen.
  let failure: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body,
      })
      if (res.ok) return
      failure = new Error(`HTTP ${res.status}`)
    } catch (e) {
      failure = e
    }
    console.error(`broadcast ${event} failed`, failure)
  }
  await reportError('broadcast', new Error(`"${event}" to ${topic} failed twice: ${failure}`))
}
