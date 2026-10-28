import { drizzle } from 'npm:drizzle-orm/postgres-js'
import postgres from 'npm:postgres'
import * as schema from './schema.ts'

export function createDb() {
  // Every concurrent request gets its own edge function instance, and each instance holds one
  // connection. Measured on the Singapore project: a burst of 15 simultaneous requests added ~13
  // connections, instances were not reused by the next burst, and they only disappeared after
  // 60-90s idle. A game (a burst every question) therefore piled up past the database's 60 slots.
  //
  // So connections are released 5s after use instead of waiting for the instance to be recycled;
  // open connections then track the *current* burst, not the last minute and a half of them.
  //
  // DATABASE_POOLER_URL (Supavisor transaction pooler, port 6543) is optional and only needed for
  // much larger groups: it multiplexes all instances onto a few real connections.
  const url = Deno.env.get('DATABASE_POOLER_URL') ?? Deno.env.get('SUPABASE_DB_URL')!
  const client = postgres(url, {
    prepare: false, // required for transaction-mode poolers
    max: 1, // one connection per instance; concurrent queries in it simply queue
    idle_timeout: 5, // seconds
    connect_timeout: 10,
  })
  return drizzle(client, { schema })
}
