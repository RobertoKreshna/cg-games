import { drizzle } from 'npm:drizzle-orm/postgres-js'
import postgres from 'npm:postgres'
import * as schema from './schema.ts'

export function createDb() {
  // prepare: false is required for Supabase's PgBouncer connection pooler
  const client = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  return drizzle(client, { schema })
}
