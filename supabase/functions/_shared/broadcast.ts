export async function broadcastToRoom(roomCode: string, event: string, payload: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const body = JSON.stringify({ messages: [{ topic: `room:${roomCode}`, event, payload }] })

  // One retry: a dropped broadcast leaves every phone stuck on the previous screen.
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
      console.error(`broadcast ${event} failed: HTTP ${res.status}`)
    } catch (e) {
      console.error(`broadcast ${event} failed`, e)
    }
  }
}
