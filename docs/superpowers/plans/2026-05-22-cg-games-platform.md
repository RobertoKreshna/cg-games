# CG Games Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based multiplayer game platform for connect groups with Bible Quiz, Verse Scramble, and Emoji Story — with room codes, host control, individual/team modes, and real-time sync.

**Architecture:** Next.js frontend calls Supabase Edge Functions (Deno) for all mutations; Edge Functions use Drizzle ORM against Supabase PostgreSQL. Supabase Realtime broadcast channels push game events to all players in a room. No auth — host and players are identified by tokens stored in localStorage.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (Edge Functions + PostgreSQL + Realtime), Drizzle ORM, Vitest

---

## File Map

```
CG Games/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                         # Home: Create or Join
│   ├── host/page.tsx                    # Host: configure → lobby → control
│   ├── join/page.tsx                    # Player: enter code + name
│   ├── play/[roomCode]/page.tsx         # Player: live game view
│   └── results/[sessionId]/page.tsx    # Leaderboard
├── components/
│   ├── games/
│   │   ├── BibleQuiz.tsx
│   │   ├── VerseScramble.tsx
│   │   └── EmojiStory.tsx
│   └── shared/
│       ├── Timer.tsx
│       └── Leaderboard.tsx
├── lib/
│   ├── supabase.ts       # Browser Supabase client
│   ├── realtime.ts       # useGameChannel hook
│   ├── tokens.ts         # localStorage session helpers
│   └── api.ts            # fetch wrappers for Edge Functions
├── lib/scoring.ts        # Pure scoring functions (tested)
├── types/game.ts         # Shared TypeScript types
├── __tests__/
│   └── scoring.test.ts
├── vitest.config.ts
├── vitest.setup.ts
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── db.ts      # Drizzle + postgres-js client
│   │   │   ├── schema.ts  # Drizzle table definitions
│   │   │   └── cors.ts    # CORS helpers + json()
│   │   ├── rooms/index.ts
│   │   └── sessions/index.ts
│   └── migrations/
│       └── 20260522000000_initial.sql
└── supabase/seed.sql
```

---

## Task 1: Project Setup

**Files:**
- Create: `CG Games/` (project root, via create-next-app)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.local`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/robertokreshna
npx create-next-app@latest "CG Games" --typescript --tailwind --app --no-src-dir --import-alias="@/*" --no-git
cd "CG Games"
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @supabase/supabase-js drizzle-orm postgres
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom drizzle-kit
```

- [ ] **Step 4: Install Supabase CLI (if not already installed)**

```bash
brew install supabase/tap/supabase
supabase --version  # should print a version number
```

- [ ] **Step 5: Initialize Supabase in the project**

```bash
supabase init
```

This creates `supabase/config.toml` and `supabase/functions/`.

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 7: Create `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Create `.env.local`**

```bash
# Fill in from your Supabase project dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Settings → Database → Connection string (URI, pooler mode)
SUPABASE_DB_URL=postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

- [ ] **Step 9: Start local Supabase (optional, for local dev)**

```bash
supabase start
# Prints local URLs and keys — use those in .env.local for local dev
```

- [ ] **Step 10: Add test script to package.json**

Open `package.json`, add under `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 11: Verify setup**

```bash
npm run test:run
# Expected: "No test files found" — no errors
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260522000000_initial.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260522000000_initial.sql

create extension if not exists "pgcrypto";

create type game_type as enum ('bible_quiz', 'verse_scramble', 'emoji_story');
create type room_mode as enum ('individual', 'team');
create type room_status as enum ('lobby', 'playing', 'finished');
create type session_status as enum ('waiting', 'question', 'reveal', 'finished');

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(6) not null unique,
  game_type game_type not null,
  mode room_mode not null default 'individual',
  status room_status not null default 'lobby',
  host_token varchar(64) not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name varchar(50) not null,
  color varchar(20) not null
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name varchar(50) not null,
  team_id uuid references teams(id) on delete set null,
  session_token varchar(64) not null,
  joined_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  game_type game_type not null,
  order_index int not null,
  content jsonb not null
);

create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  current_question_index int not null default 0,
  status session_status not null default 'waiting',
  started_at timestamptz
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  session_id uuid not null references game_sessions(id) on delete cascade,
  submitted_answer text not null,
  is_correct boolean not null,
  points int not null default 0,
  time_taken_ms int not null,
  created_at timestamptz not null default now(),
  unique(player_id, question_id, session_id)
);
```

- [ ] **Step 2: Apply migration**

If using local Supabase:
```bash
supabase db reset
# Expected: migration applies, tables created
```

If using hosted Supabase:
```bash
supabase db push
# Expected: migration applied to remote project
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add initial database schema"
```

---

## Task 3: Drizzle Schema + Edge Function Shared Utilities

**Files:**
- Create: `supabase/functions/_shared/schema.ts`
- Create: `supabase/functions/_shared/db.ts`
- Create: `supabase/functions/_shared/cors.ts`

These files are imported by all Edge Functions using `../` relative imports and run in Deno. They use `npm:` specifiers to import Node packages.

- [ ] **Step 1: Create `supabase/functions/_shared/schema.ts`**

```typescript
import {
  pgTable, pgEnum, uuid, varchar, text, integer,
  boolean, timestamp, jsonb, unique,
} from 'npm:drizzle-orm/pg-core'

export const gameTypeEnum = pgEnum('game_type', ['bible_quiz', 'verse_scramble', 'emoji_story'])
export const roomModeEnum = pgEnum('room_mode', ['individual', 'team'])
export const roomStatusEnum = pgEnum('room_status', ['lobby', 'playing', 'finished'])
export const sessionStatusEnum = pgEnum('session_status', ['waiting', 'question', 'reveal', 'finished'])

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 6 }).notNull().unique(),
  gameType: gameTypeEnum('game_type').notNull(),
  mode: roomModeEnum('mode').notNull().default('individual'),
  status: roomStatusEnum('status').notNull().default('lobby'),
  hostToken: varchar('host_token', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 20 }).notNull(),
})

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  sessionToken: varchar('session_token', { length: 64 }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
})

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameType: gameTypeEnum('game_type').notNull(),
  orderIndex: integer('order_index').notNull(),
  content: jsonb('content').notNull(),
})

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  currentQuestionIndex: integer('current_question_index').notNull().default(0),
  status: sessionStatusEnum('status').notNull().default('waiting'),
  startedAt: timestamp('started_at', { withTimezone: true }),
})

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  submittedAnswer: text('submitted_answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  points: integer('points').notNull().default(0),
  timeTakenMs: integer('time_taken_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePlayerQuestion: unique().on(t.playerId, t.questionId, t.sessionId),
}))
```

- [ ] **Step 2: Create `supabase/functions/_shared/db.ts`**

```typescript
import { drizzle } from 'npm:drizzle-orm/postgres-js'
import postgres from 'npm:postgres'
import * as schema from './schema.ts'

export function createDb() {
  // SUPABASE_DB_URL is set automatically in Edge Function environment
  const connectionString = Deno.env.get('SUPABASE_DB_URL')!
  // prepare: false is required for Supabase's PgBouncer connection pooler
  const client = postgres(connectionString, { prepare: false })
  return drizzle(client, { schema })
}
```

- [ ] **Step 3: Create `supabase/functions/_shared/cors.ts`**

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-host-token, x-session-token',
}

export function corsResponse() {
  return new Response('ok', { headers: corsHeaders })
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat: add edge function shared db, schema, and cors utilities"
```

---

## Task 4: Scoring Logic (TDD)

**Files:**
- Create: `lib/scoring.ts`
- Create: `__tests__/scoring.test.ts`

These are pure functions — no DB, no Supabase, fully unit-testable. The same logic is duplicated inside the sessions Edge Function (Deno can't import from `lib/`).

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/scoring.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcBibleQuizPoints,
  calcVerseScramblePoints,
  calcEmojiStoryPoints,
} from '@/lib/scoring'

describe('calcBibleQuizPoints', () => {
  it('returns 1000 for instant answer', () => {
    expect(calcBibleQuizPoints(0)).toBe(1000)
  })
  it('returns 0 at time limit', () => {
    expect(calcBibleQuizPoints(15000)).toBe(0)
  })
  it('returns ~500 at halfway', () => {
    expect(calcBibleQuizPoints(7500)).toBe(500)
  })
  it('never goes negative', () => {
    expect(calcBibleQuizPoints(99999)).toBe(0)
  })
})

describe('calcVerseScramblePoints', () => {
  it('returns 1000 for all-correct instant', () => {
    expect(calcVerseScramblePoints(5, 5, 0)).toBe(1000)
  })
  it('returns 500 for all-correct at time limit', () => {
    expect(calcVerseScramblePoints(5, 5, 30000)).toBe(500)
  })
  it('returns 0 for no correct words', () => {
    expect(calcVerseScramblePoints(0, 5, 0)).toBe(0)
  })
  it('never goes negative', () => {
    expect(calcVerseScramblePoints(0, 5, 99999)).toBe(0)
  })
  it('scales by accuracy', () => {
    // 3/5 correct, instant → 3/5 * 1000 * 1.0 = 600
    expect(calcVerseScramblePoints(3, 5, 0)).toBe(600)
  })
})

describe('calcEmojiStoryPoints', () => {
  it('returns 1000 for exact match', () => {
    expect(calcEmojiStoryPoints('mukjizat lima roti dua ikan', 'mukjizat lima roti dua ikan')).toBe(1000)
  })
  it('returns 1000 for case-insensitive exact match', () => {
    expect(calcEmojiStoryPoints('MUKJIZAT LIMA ROTI DUA IKAN', 'mukjizat lima roti dua ikan')).toBe(1000)
  })
  it('returns 1000 for trimmed match', () => {
    expect(calcEmojiStoryPoints('  mukjizat lima roti dua ikan  ', 'mukjizat lima roti dua ikan')).toBe(1000)
  })
  it('returns 500 for partial match (≥60% key words)', () => {
    // answer has 5 words, "roti ikan dua" matches 3 → 3/5 = 60% → 500
    expect(calcEmojiStoryPoints('roti ikan dua', 'mukjizat lima roti dua ikan')).toBe(500)
  })
  it('returns 0 for no meaningful match', () => {
    expect(calcEmojiStoryPoints('tidak tahu', 'mukjizat lima roti dua ikan')).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:run
# Expected: FAIL — "Cannot find module '@/lib/scoring'"
```

- [ ] **Step 3: Implement `lib/scoring.ts`**

```typescript
export function calcBibleQuizPoints(timeMs: number, timerMs = 15000): number {
  return Math.max(0, Math.round(1000 - (timeMs / timerMs) * 1000))
}

export function calcVerseScramblePoints(
  correctWords: number,
  totalWords: number,
  timeMs: number,
  timerMs = 30000,
): number {
  const accuracy = correctWords / totalWords
  const speedMultiplier = 1.0 - (timeMs / timerMs) * 0.5
  return Math.max(0, Math.round(accuracy * 1000 * speedMultiplier))
}

export function calcEmojiStoryPoints(submitted: string, answer: string): number {
  const normalize = (s: string) => s.toLowerCase().trim()
  if (normalize(submitted) === normalize(answer)) return 1000
  const answerWords = normalize(answer).split(' ')
  const submittedNorm = normalize(submitted)
  const matchCount = answerWords.filter((w) => submittedNorm.includes(w)).length
  if (matchCount >= Math.ceil(answerWords.length * 0.6)) return 500
  return 0
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test:run
# Expected: PASS — 12 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts __tests__/scoring.test.ts
git commit -m "feat: add scoring logic with tests"
```

---

## Task 5: Rooms Edge Function

**Files:**
- Create: `supabase/functions/rooms/index.ts`

Handles: `POST /` (create room), `POST /:code/join`, `POST /:code/teams` (assign teams, host only), `POST /:code/start` (host only).

URL routing is done by parsing the request path — Supabase calls this function at `/functions/v1/rooms/*`.

- [ ] **Step 1: Create `supabase/functions/rooms/index.ts`**

```typescript
import { createDb } from '../_shared/db.ts'
import { rooms, players, teams, gameSessions } from '../_shared/schema.ts'
import { corsResponse, json } from '../_shared/cors.ts'
import { eq, and } from 'npm:drizzle-orm'

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  // Path after /functions/v1/rooms → split into segments
  const segments = url.pathname.replace(/^.*\/rooms\/?/, '').split('/').filter(Boolean)
  const db = createDb()

  try {
    // POST /rooms → create room
    if (req.method === 'POST' && segments.length === 0) {
      const { game_type, mode = 'individual' } = await req.json()
      if (!game_type) return json({ error: 'game_type required' }, 400)

      let code = ''
      for (let i = 0; i < 10; i++) {
        const candidate = generateRoomCode()
        const existing = await db.select().from(rooms).where(eq(rooms.code, candidate))
        if (existing.length === 0) { code = candidate; break }
      }
      if (!code) return json({ error: 'could not generate unique code' }, 500)

      const hostToken = generateToken()
      const [room] = await db.insert(rooms).values({ code, gameType: game_type, mode, hostToken }).returning()
      return json({ room_id: room.id, code: room.code, host_token: hostToken })
    }

    // POST /rooms/:code/join
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'join') {
      const code = segments[0]
      const { name } = await req.json()
      if (!name?.trim()) return json({ error: 'name required' }, 400)

      const [room] = await db.select().from(rooms).where(eq(rooms.code, code))
      if (!room) return json({ error: 'room not found' }, 404)
      if (room.status !== 'lobby') return json({ error: 'game already started' }, 400)

      const sessionToken = generateToken()
      const [player] = await db.insert(players).values({
        roomId: room.id,
        name: name.trim(),
        sessionToken,
      }).returning()

      return json({
        player_id: player.id,
        session_token: sessionToken,
        room: { id: room.id, code: room.code, game_type: room.gameType, mode: room.mode },
      })
    }

    // POST /rooms/:code/teams → randomly assign teams (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'teams') {
      const code = segments[0]
      const hostToken = req.headers.get('x-host-token')
      const { team_count = 3 } = await req.json()

      const [room] = await db.select().from(rooms).where(
        and(eq(rooms.code, code), eq(rooms.hostToken, hostToken ?? ''))
      )
      if (!room) return json({ error: 'unauthorized' }, 403)

      const NAMES = ['Tim Merah', 'Tim Biru', 'Tim Hijau', 'Tim Kuning', 'Tim Ungu']
      const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']

      await db.delete(teams).where(eq(teams.roomId, room.id))
      const createdTeams = await db.insert(teams).values(
        Array.from({ length: team_count }, (_, i) => ({
          roomId: room.id,
          name: NAMES[i] ?? `Tim ${i + 1}`,
          color: COLORS[i] ?? '#6b7280',
        }))
      ).returning()

      const allPlayers = await db.select().from(players).where(eq(players.roomId, room.id))
      const shuffled = [...allPlayers].sort(() => Math.random() - 0.5)

      for (let i = 0; i < shuffled.length; i++) {
        await db.update(players)
          .set({ teamId: createdTeams[i % team_count].id })
          .where(eq(players.id, shuffled[i].id))
      }

      const result = createdTeams.map((t, i) => ({
        ...t,
        members: shuffled
          .filter((_, idx) => idx % team_count === i)
          .map((p) => ({ id: p.id, name: p.name })),
      }))

      // Broadcast via Supabase Realtime REST API
      await broadcastToRoom(room.code, 'teams_assigned', { teams: result })

      return json({ teams: result })
    }

    // POST /rooms/:code/start → start game (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'start') {
      const code = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [room] = await db.select().from(rooms).where(
        and(eq(rooms.code, code), eq(rooms.hostToken, hostToken ?? ''))
      )
      if (!room) return json({ error: 'unauthorized' }, 403)

      await db.update(rooms).set({ status: 'playing' }).where(eq(rooms.id, room.id))
      const [session] = await db.insert(gameSessions).values({
        roomId: room.id,
        startedAt: new Date(),
      }).returning()

      await broadcastToRoom(room.code, 'game_started', { session_id: session.id })
      return json({ session_id: session.id })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'internal server error' }, 500)
  }
})

async function broadcastToRoom(roomCode: string, event: string, payload: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomCode}`, event, payload }],
    }),
  })
}
```

- [ ] **Step 2: Serve the function locally and smoke test**

```bash
supabase functions serve rooms --env-file .env.local
```

In a new terminal:
```bash
curl -X POST http://localhost:54321/functions/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{"game_type":"bible_quiz","mode":"individual"}'
# Expected: {"room_id":"...","code":"ABC123","host_token":"..."}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rooms/
git commit -m "feat: add rooms edge function (create, join, teams, start)"
```

---

## Task 6: Sessions Edge Function

**Files:**
- Create: `supabase/functions/sessions/index.ts`

Handles: `POST /:id/next` (host advances question), `POST /:id/answer` (player submits), `GET /:id/leaderboard`.

Scoring logic is duplicated here (Deno can't import from `lib/`).

- [ ] **Step 1: Create `supabase/functions/sessions/index.ts`**

```typescript
import { createDb } from '../_shared/db.ts'
import { gameSessions, questions, answers, players, rooms, teams } from '../_shared/schema.ts'
import { corsResponse, json } from '../_shared/cors.ts'
import { eq, and, sql } from 'npm:drizzle-orm'

// Scoring — duplicated from lib/scoring.ts (Deno can't import from Next.js lib/)
function calcBibleQuizPoints(timeMs: number): number {
  return Math.max(0, Math.round(1000 - (timeMs / 15000) * 1000))
}

function calcVerseScramblePoints(correctWords: number, totalWords: number, timeMs: number): number {
  const accuracy = correctWords / totalWords
  const speedMultiplier = 1.0 - (timeMs / 30000) * 0.5
  return Math.max(0, Math.round(accuracy * 1000 * speedMultiplier))
}

function calcEmojiStoryPoints(submitted: string, answer: string): number {
  const normalize = (s: string) => s.toLowerCase().trim()
  if (normalize(submitted) === normalize(answer)) return 1000
  const answerWords = normalize(answer).split(' ')
  const submittedNorm = normalize(submitted)
  const matchCount = answerWords.filter((w) => submittedNorm.includes(w)).length
  if (matchCount >= Math.ceil(answerWords.length * 0.6)) return 500
  return 0
}

async function broadcastToRoom(roomCode: string, event: string, payload: unknown) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomCode}`, event, payload }],
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const url = new URL(req.url)
  const segments = url.pathname.replace(/^.*\/sessions\/?/, '').split('/').filter(Boolean)
  const db = createDb()

  try {
    // GET /sessions/:id/leaderboard
    if (req.method === 'GET' && segments.length === 2 && segments[1] === 'leaderboard') {
      const sessionId = segments[0]

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))
      if (!row) return json({ error: 'session not found' }, 404)

      if (row.room.mode === 'individual') {
        const leaderboard = await db
          .select({
            playerId: answers.playerId,
            playerName: players.name,
            totalPoints: sql<number>`sum(${answers.points})::int`,
          })
          .from(answers)
          .innerJoin(players, eq(answers.playerId, players.id))
          .where(eq(answers.sessionId, sessionId))
          .groupBy(answers.playerId, players.name)
          .orderBy(sql`sum(${answers.points}) desc`)
        return json({ mode: 'individual', leaderboard })
      } else {
        const leaderboard = await db
          .select({
            teamId: teams.id,
            teamName: teams.name,
            teamColor: teams.color,
            totalPoints: sql<number>`sum(${answers.points})::int`,
          })
          .from(answers)
          .innerJoin(players, eq(answers.playerId, players.id))
          .innerJoin(teams, eq(players.teamId, teams.id))
          .where(eq(answers.sessionId, sessionId))
          .groupBy(teams.id, teams.name, teams.color)
          .orderBy(sql`sum(${answers.points}) desc`)
        return json({ mode: 'team', leaderboard })
      }
    }

    // POST /sessions/:id/next → advance question (host only)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'next') {
      const sessionId = segments[0]
      const hostToken = req.headers.get('x-host-token')

      const [row] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(and(eq(gameSessions.id, sessionId), eq(rooms.hostToken, hostToken ?? '')))
      if (!row) return json({ error: 'unauthorized' }, 403)

      const allQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.gameType, row.room.gameType))
        .orderBy(questions.orderIndex)

      // On first call status is 'waiting' → show question 0
      // On subsequent calls → increment index
      const nextIndex =
        row.session.status === 'waiting'
          ? 0
          : row.session.currentQuestionIndex + 1

      if (nextIndex >= allQuestions.length) {
        await db.update(gameSessions).set({ status: 'finished' }).where(eq(gameSessions.id, sessionId))
        await db.update(rooms).set({ status: 'finished' }).where(eq(rooms.id, row.room.id))
        await broadcastToRoom(row.room.code, 'game_finished', { session_id: sessionId })
        return json({ status: 'finished', session_id: sessionId })
      }

      const q = allQuestions[nextIndex]
      await db.update(gameSessions)
        .set({ currentQuestionIndex: nextIndex, status: 'question' })
        .where(eq(gameSessions.id, sessionId))

      await broadcastToRoom(row.room.code, 'question_show', {
        question_index: nextIndex,
        question_id: q.id,
        game_type: q.gameType,
        content: q.content,
        total_questions: allQuestions.length,
      })

      return json({ status: 'question', question_index: nextIndex, question_id: q.id })
    }

    // POST /sessions/:id/answer → submit answer (player)
    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'answer') {
      const sessionId = segments[0]
      const sessionToken = req.headers.get('x-session-token')
      const { question_id, submitted_answer, time_taken_ms } = await req.json()

      const [player] = await db.select().from(players).where(eq(players.sessionToken, sessionToken ?? ''))
      if (!player) return json({ error: 'unauthorized' }, 403)

      const [question] = await db.select().from(questions).where(eq(questions.id, question_id))
      if (!question) return json({ error: 'question not found' }, 404)

      const content = question.content as Record<string, unknown>
      let isCorrect = false
      let points = 0

      if (question.gameType === 'bible_quiz') {
        isCorrect = submitted_answer === String(content.answer_index)
        points = isCorrect ? calcBibleQuizPoints(time_taken_ms) : 0
      } else if (question.gameType === 'verse_scramble') {
        const correctOrder = content.correct_order as number[]
        const submittedOrder = JSON.parse(submitted_answer) as number[]
        const correctWords = correctOrder.filter((v, i) => v === submittedOrder[i]).length
        isCorrect = correctWords === correctOrder.length
        points = calcVerseScramblePoints(correctWords, correctOrder.length, time_taken_ms)
      } else if (question.gameType === 'emoji_story') {
        points = calcEmojiStoryPoints(submitted_answer, content.answer as string)
        isCorrect = points > 0
      }

      await db.insert(answers).values({
        playerId: player.id,
        questionId: question_id,
        sessionId,
        submittedAnswer: submitted_answer,
        isCorrect,
        points,
        timeTakenMs: time_taken_ms,
      }).onConflictDoNothing()

      // Check if all players in room answered → auto-broadcast reveal
      const [sessionRow] = await db
        .select({ session: gameSessions, room: rooms })
        .from(gameSessions)
        .innerJoin(rooms, eq(gameSessions.roomId, rooms.id))
        .where(eq(gameSessions.id, sessionId))

      const [{ totalPlayers }] = await db
        .select({ totalPlayers: sql<number>`count(*)::int` })
        .from(players)
        .where(eq(players.roomId, sessionRow.room.id))

      const [{ answeredCount }] = await db
        .select({ answeredCount: sql<number>`count(*)::int` })
        .from(answers)
        .where(and(eq(answers.sessionId, sessionId), eq(answers.questionId, question_id)))

      if (answeredCount >= totalPlayers) {
        await db.update(gameSessions).set({ status: 'reveal' }).where(eq(gameSessions.id, sessionId))
        await broadcastToRoom(sessionRow.room.code, 'question_reveal', {
          question_id,
          correct_answer: content.answer_index ?? content.answer,
        })
      }

      return json({ points, is_correct: isCorrect })
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'internal server error' }, 500)
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sessions/
git commit -m "feat: add sessions edge function (next, answer, leaderboard)"
```

---

## Task 7: Frontend Core Utilities

**Files:**
- Create: `lib/supabase.ts`
- Create: `lib/tokens.ts`
- Create: `lib/api.ts`
- Create: `types/game.ts`

- [ ] **Step 1: Create `lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

- [ ] **Step 2: Create `types/game.ts`**

```typescript
export type GameType = 'bible_quiz' | 'verse_scramble' | 'emoji_story'
export type RoomMode = 'individual' | 'team'

export interface BibleQuizContent {
  question: string
  options: string[]
  answer_index: number
}

export interface VerseScrambleContent {
  reference: string
  words: string[]
  correct_order: number[]
}

export interface EmojiStoryContent {
  emojis: string
  answer: string
  hint: string
}

export type QuestionContent = BibleQuizContent | VerseScrambleContent | EmojiStoryContent

export interface LeaderboardEntry {
  playerId?: string
  playerName?: string
  teamId?: string
  teamName?: string
  teamColor?: string
  totalPoints: number
}
```

- [ ] **Step 3: Create `lib/tokens.ts`**

```typescript
interface PlayerSession {
  sessionToken: string
  playerId: string
  gameType?: string
  mode?: string
}

interface HostSession {
  hostToken: string
  roomId: string
  sessionId?: string
}

export function savePlayerSession(roomCode: string, data: PlayerSession): void {
  localStorage.setItem(`player:${roomCode}`, JSON.stringify(data))
}

export function getPlayerSession(roomCode: string): PlayerSession | null {
  const raw = localStorage.getItem(`player:${roomCode}`)
  return raw ? JSON.parse(raw) : null
}

export function saveHostSession(roomCode: string, data: HostSession): void {
  localStorage.setItem(`host:${roomCode}`, JSON.stringify(data))
}

export function getHostSession(roomCode: string): HostSession | null {
  const raw = localStorage.getItem(`host:${roomCode}`)
  return raw ? JSON.parse(raw) : null
}

export function updateHostSession(roomCode: string, patch: Partial<HostSession>): void {
  const existing = getHostSession(roomCode) ?? { hostToken: '', roomId: '' }
  saveHostSession(roomCode, { ...existing, ...patch })
}
```

- [ ] **Step 4: Create `lib/api.ts`**

```typescript
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function createRoom(gameType: string, mode: string) {
  return call('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_type: gameType, mode }),
  })
}

export function joinRoom(code: string, name: string) {
  return call(`/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function assignTeams(code: string, hostToken: string, teamCount: number) {
  return call(`/rooms/${code}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({ team_count: teamCount }),
  })
}

export function startGame(code: string, hostToken: string) {
  return call(`/rooms/${code}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function nextQuestion(sessionId: string, hostToken: string) {
  return call(`/sessions/${sessionId}/next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
    body: JSON.stringify({}),
  })
}

export function submitAnswer(
  sessionId: string,
  sessionToken: string,
  data: { question_id: string; submitted_answer: string; time_taken_ms: number },
) {
  return call(`/sessions/${sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken },
    body: JSON.stringify(data),
  })
}

export function getLeaderboard(sessionId: string) {
  return call(`/sessions/${sessionId}/leaderboard`)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/ types/
git commit -m "feat: add frontend core utilities (supabase client, tokens, api)"
```

---

## Task 8: Realtime Hook

**Files:**
- Create: `lib/realtime.ts`

- [ ] **Step 1: Create `lib/realtime.ts`**

```typescript
'use client'
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BibleQuizContent, VerseScrambleContent, EmojiStoryContent, GameType } from '@/types/game'

export type GameEvent =
  | { event: 'player_joined'; payload: { name: string; player_id: string } }
  | { event: 'teams_assigned'; payload: { teams: Array<{ id: string; name: string; color: string; members: Array<{ id: string; name: string }> }> } }
  | { event: 'game_started'; payload: { session_id: string } }
  | { event: 'question_show'; payload: { question_index: number; question_id: string; game_type: GameType; content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent; total_questions: number } }
  | { event: 'question_reveal'; payload: { question_id: string; correct_answer: unknown } }
  | { event: 'game_finished'; payload: { session_id: string } }

const EVENTS: GameEvent['event'][] = [
  'player_joined', 'teams_assigned', 'game_started',
  'question_show', 'question_reveal', 'game_finished',
]

export function useGameChannel(
  roomCode: string | null,
  onEvent: (e: GameEvent) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!roomCode) return
    const channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false } },
    })
    EVENTS.forEach((event) => {
      channel.on('broadcast', { event }, ({ payload }) => {
        onEventRef.current({ event, payload } as GameEvent)
      })
    })
    channel.subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [roomCode])
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/realtime.ts
git commit -m "feat: add useGameChannel realtime hook"
```

---

## Task 9: Shared UI Components

**Files:**
- Create: `components/shared/Timer.tsx`
- Create: `components/shared/Leaderboard.tsx`

- [ ] **Step 1: Create `components/shared/Timer.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'

interface TimerProps {
  durationMs: number
  onExpire: () => void
  className?: string
}

export function Timer({ durationMs, onExpire, className = '' }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs)

  useEffect(() => {
    setRemainingMs(durationMs)
    const start = Date.now()
    const interval = setInterval(() => {
      const remaining = Math.max(0, durationMs - (Date.now() - start))
      setRemainingMs(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onExpire()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [durationMs, onExpire])

  const pct = remainingMs / durationMs
  const seconds = Math.ceil(remainingMs / 1000)
  const circumference = 2 * Math.PI * 28
  const color = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#eab308' : '#ef4444'

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#ffffff30" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            className="transition-all duration-100"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-bold text-xl text-white">
          {seconds}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/shared/Leaderboard.tsx`**

```tsx
import type { LeaderboardEntry } from '@/types/game'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  mode: 'individual' | 'team'
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({ entries, mode }: LeaderboardProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
      {entries.map((entry, i) => (
        <div
          key={entry.playerId ?? entry.teamId}
          className="flex items-center gap-3 bg-white/10 rounded-2xl p-3 text-white"
        >
          <span className="text-2xl w-8 text-center font-bold">
            {MEDALS[i] ?? `${i + 1}`}
          </span>
          {mode === 'team' && entry.teamColor && (
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.teamColor }}
            />
          )}
          <span className="flex-1 font-semibold">{entry.playerName ?? entry.teamName}</span>
          <span className="font-bold text-yellow-300">{entry.totalPoints ?? 0} pts</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/shared/
git commit -m "feat: add Timer and Leaderboard shared components"
```

---

## Task 10: Game Components

**Files:**
- Create: `components/games/BibleQuiz.tsx`
- Create: `components/games/VerseScramble.tsx`
- Create: `components/games/EmojiStory.tsx`

- [ ] **Step 1: Create `components/games/BibleQuiz.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { BibleQuizContent } from '@/types/game'

interface Props {
  questionId: string
  content: BibleQuizContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b']
const LABELS = ['A', 'B', 'C', 'D']

export function BibleQuiz({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  async function handleSelect(index: number) {
    if (answered) return
    setSelected(index)
    setAnswered(true)
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: String(index),
      time_taken_ms: Date.now() - startRef.current,
    })
    onAnswered(result.points)
  }

  function handleExpire() {
    if (answered) return
    setAnswered(true)
    submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: '-1',
      time_taken_ms: 15000,
    }).then((r) => onAnswered(r.points))
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-4">
          <p className="text-white/60 text-sm mb-1">Soal {questionIndex + 1} / {totalQuestions}</p>
          <h2 className="text-white text-lg font-bold leading-snug">{content.question}</h2>
        </div>
        <Timer durationMs={15000} onExpire={handleExpire} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {content.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={answered}
            style={{ backgroundColor: selected === i ? COLORS[i] : '#ffffff', color: selected === i ? '#fff' : '#1f2937' }}
            className="p-4 rounded-2xl font-semibold text-left shadow-md active:scale-95 transition-all disabled:cursor-default"
          >
            <span className="font-bold mr-2">{LABELS[i]}.</span>{opt}
          </button>
        ))}
      </div>
      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/games/VerseScramble.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { VerseScrambleContent } from '@/types/game'

interface Props {
  questionId: string
  content: VerseScrambleContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

export function VerseScramble({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [placed, setPlaced] = useState<number[]>([])
  const [available, setAvailable] = useState<number[]>(() => content.words.map((_, i) => i))
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  function tap(wordIndex: number) {
    if (answered) return
    setAvailable((p) => p.filter((i) => i !== wordIndex))
    setPlaced((p) => [...p, wordIndex])
  }

  function remove(pos: number) {
    if (answered) return
    const wordIndex = placed[pos]
    setPlaced((p) => p.filter((_, i) => i !== pos))
    setAvailable((p) => [...p, wordIndex])
  }

  async function doSubmit(indices: number[], elapsed: number) {
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: JSON.stringify(indices),
      time_taken_ms: elapsed,
    })
    onAnswered(result.points)
  }

  async function handleSubmit() {
    if (answered) return
    setAnswered(true)
    await doSubmit(placed, Date.now() - startRef.current)
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    await doSubmit(placed, 30000)
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-white/60 text-sm">Soal {questionIndex + 1} / {totalQuestions}</p>
          <p className="text-white font-semibold">{content.reference}</p>
        </div>
        <Timer durationMs={30000} onExpire={handleExpire} />
      </div>

      <div className="min-h-20 bg-white/10 rounded-2xl p-3 flex flex-wrap gap-2 border-2 border-white/20">
        {placed.length === 0 && (
          <p className="text-white/40 text-sm self-center mx-auto">Ketuk kata di bawah untuk menyusun ayat</p>
        )}
        {placed.map((wordIndex, pos) => (
          <button
            key={pos}
            onClick={() => remove(pos)}
            className="bg-white text-gray-800 px-3 py-1 rounded-lg font-medium shadow text-sm active:scale-95"
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((wordIndex) => (
          <button
            key={wordIndex}
            onClick={() => tap(wordIndex)}
            disabled={answered}
            className="bg-blue-500 text-white px-3 py-2 rounded-xl font-medium active:scale-95 transition-transform disabled:opacity-40"
          >
            {content.words[wordIndex]}
          </button>
        ))}
      </div>

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={placed.length === 0}
          className="bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 active:scale-95"
        >
          Submit
        </button>
      )}

      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu soal berikutnya...</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/games/EmojiStory.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { submitAnswer } from '@/lib/api'
import type { EmojiStoryContent } from '@/types/game'

interface Props {
  questionId: string
  content: EmojiStoryContent
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  onAnswered: (points: number) => void
}

export function EmojiStory({ questionId, content, sessionId, sessionToken, questionIndex, totalQuestions, onAnswered }: Props) {
  const [answer, setAnswer] = useState('')
  const [answered, setAnswered] = useState(false)
  const startRef = useRef(Date.now())

  async function doSubmit(text: string, elapsed: number) {
    const result = await submitAnswer(sessionId, sessionToken, {
      question_id: questionId,
      submitted_answer: text,
      time_taken_ms: elapsed,
    })
    onAnswered(result.points)
  }

  async function handleSubmit() {
    if (answered || !answer.trim()) return
    setAnswered(true)
    await doSubmit(answer.trim(), Date.now() - startRef.current)
  }

  async function handleExpire() {
    if (answered) return
    setAnswered(true)
    await doSubmit(answer.trim() || '', 20000)
  }

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto w-full flex-1 items-center">
      <div className="flex justify-between w-full items-center">
        <p className="text-white/60 text-sm">Soal {questionIndex + 1} / {totalQuestions} — Tebak kisahnya!</p>
        <Timer durationMs={20000} onExpire={handleExpire} />
      </div>

      <p className="text-7xl tracking-widest text-center py-4">{content.emojis}</p>

      <p className="text-white/50 text-xs">Hint: {content.hint}</p>

      <input
        className="w-full bg-white/20 border-2 border-white/30 text-white placeholder:text-white/40 rounded-xl p-3 text-center text-lg focus:outline-none focus:border-white"
        placeholder="Jawaban kamu..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={answered}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
      />

      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim()}
          className="bg-white text-blue-700 font-bold py-3 px-10 rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
        >
          Submit
        </button>
      )}

      {answered && (
        <p className="text-center text-white/70 text-sm animate-pulse">Menunggu reveal...</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/games/
git commit -m "feat: add BibleQuiz, VerseScramble, EmojiStory game components"
```

---

## Task 11: Pages — Home, Join, Results

**Files:**
- Modify: `app/page.tsx`
- Create: `app/join/page.tsx`
- Create: `app/results/[sessionId]/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 p-6">
      <h1 className="text-5xl font-bold text-white mb-2">CG Games</h1>
      <p className="text-blue-100 mb-14 text-lg">Game seru buat connect group 🎮</p>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => router.push('/host')}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg shadow-xl active:scale-95 transition-transform"
        >
          Buat Room
        </button>
        <button
          onClick={() => router.push('/join')}
          className="bg-blue-500 text-white font-bold py-4 rounded-2xl text-lg border-2 border-white/30 active:scale-95 transition-transform"
        >
          Gabung Room
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create `app/join/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinRoom } from '@/lib/api'
import { savePlayerSession } from '@/lib/tokens'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    if (!code.trim() || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await joinRoom(code.toUpperCase().trim(), name.trim())
      savePlayerSession(code.toUpperCase().trim(), {
        sessionToken: data.session_token,
        playerId: data.player_id,
        gameType: data.room.game_type,
        mode: data.room.mode,
      })
      router.push(`/play/${code.toUpperCase().trim()}`)
    } catch {
      setError('Room tidak ditemukan atau game sudah mulai.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 p-4">
      <h1 className="text-3xl font-bold text-white mb-8">Gabung Room</h1>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4">
        <input
          className="border-2 border-gray-200 rounded-xl p-3 text-center text-2xl font-bold uppercase tracking-widest focus:border-blue-500 outline-none"
          placeholder="KODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
        />
        <input
          className="border-2 border-gray-200 rounded-xl p-3 text-center text-lg focus:border-blue-500 outline-none"
          placeholder="Nama kamu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={loading || !code.trim() || !name.trim()}
          className="bg-blue-600 text-white font-bold py-3 rounded-xl text-lg disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Joining...' : 'Masuk'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create `app/results/[sessionId]/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLeaderboard } from '@/lib/api'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { LeaderboardEntry, RoomMode } from '@/types/game'

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [mode, setMode] = useState<RoomMode>('individual')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLeaderboard(sessionId)
      .then((data) => { setEntries(data.leaderboard); setMode(data.mode) })
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-4 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white flex-1">🏆 Leaderboard</h1>
      </div>

      {loading ? (
        <p className="text-white/70 text-center">Loading...</p>
      ) : (
        <Leaderboard entries={entries} mode={mode} />
      )}

      <button
        onClick={() => router.push('/')}
        className="mt-8 bg-white/20 text-white font-semibold py-3 rounded-xl border border-white/30 active:scale-95"
      >
        Kembali ke Home
      </button>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/join/ app/results/
git commit -m "feat: add home, join, and results pages"
```

---

## Task 12: Player Game Page

**Files:**
- Create: `app/play/[roomCode]/page.tsx`

This page connects to realtime and renders the correct game component based on `game_type` in the event payload.

- [ ] **Step 1: Create `app/play/[roomCode]/page.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useGameChannel } from '@/lib/realtime'
import { getPlayerSession } from '@/lib/tokens'
import { BibleQuiz } from '@/components/games/BibleQuiz'
import { VerseScramble } from '@/components/games/VerseScramble'
import { EmojiStory } from '@/components/games/EmojiStory'
import type { BibleQuizContent, EmojiStoryContent, GameType, VerseScrambleContent } from '@/types/game'

type Phase = 'lobby' | 'question' | 'answered' | 'reveal'

interface ActiveQuestion {
  questionId: string
  gameType: GameType
  content: BibleQuizContent | VerseScrambleContent | EmojiStoryContent
  questionIndex: number
  totalQuestions: number
}

export default function PlayPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const router = useRouter()
  const session = getPlayerSession(roomCode)

  const [phase, setPhase] = useState<Phase>('lobby')
  const [question, setQuestion] = useState<ActiveQuestion | null>(null)
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const handleEvent = useCallback(
    (e: Parameters<typeof useGameChannel>[1] extends (e: infer E) => void ? E : never) => {
      if (e.event === 'game_started') {
        sessionIdRef.current = e.payload.session_id
      } else if (e.event === 'question_show') {
        setLastPoints(null)
        setQuestion({
          questionId: e.payload.question_id,
          gameType: e.payload.game_type,
          content: e.payload.content,
          questionIndex: e.payload.question_index,
          totalQuestions: e.payload.total_questions,
        })
        setPhase('question')
      } else if (e.event === 'question_reveal') {
        setPhase('reveal')
      } else if (e.event === 'game_finished') {
        router.push(`/results/${sessionIdRef.current}`)
      }
    },
    [router],
  )

  useGameChannel(roomCode, handleEvent)

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-blue-700">
        <div className="text-center text-white">
          <p className="mb-4">Session tidak ditemukan.</p>
          <a href="/join" className="underline">Join ulang</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex flex-col">
      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="text-6xl animate-bounce">⏳</div>
          <p className="text-white text-xl font-semibold">Menunggu host mulai...</p>
          <p className="text-blue-200">Kode: {roomCode}</p>
        </div>
      )}

      {phase === 'question' && question && sessionIdRef.current && (
        <>
          {question.gameType === 'bible_quiz' && (
            <BibleQuiz
              questionId={question.questionId}
              content={question.content as BibleQuizContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
          {question.gameType === 'verse_scramble' && (
            <VerseScramble
              questionId={question.questionId}
              content={question.content as VerseScrambleContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
          {question.gameType === 'emoji_story' && (
            <EmojiStory
              questionId={question.questionId}
              content={question.content as EmojiStoryContent}
              sessionId={sessionIdRef.current}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              onAnswered={(pts) => { setLastPoints(pts); setPhase('answered') }}
            />
          )}
        </>
      )}

      {(phase === 'answered' || phase === 'reveal') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {lastPoints !== null ? (
            <>
              <div className="text-7xl">{lastPoints >= 500 ? '🎉' : lastPoints > 0 ? '👍' : '😅'}</div>
              <p className="text-white text-4xl font-bold">+{lastPoints}</p>
              <p className="text-blue-200">poin</p>
            </>
          ) : (
            <p className="text-white text-xl">Menunggu soal berikutnya...</p>
          )}
          <p className="text-white/50 text-sm animate-pulse mt-4">Menunggu host...</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/play/
git commit -m "feat: add player game page with realtime event handling"
```

---

## Task 13: Host Page

**Files:**
- Create: `app/host/page.tsx`

The host page is a state machine: `configure → lobby → playing → finished`. This is the most complex page.

- [ ] **Step 1: Create `app/host/page.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, assignTeams, startGame, nextQuestion } from '@/lib/api'
import { saveHostSession, getHostSession, updateHostSession } from '@/lib/tokens'
import { useGameChannel } from '@/lib/realtime'
import { Leaderboard } from '@/components/shared/Leaderboard'
import type { GameType, LeaderboardEntry, RoomMode } from '@/types/game'

type HostPhase = 'configure' | 'lobby' | 'playing' | 'finished'

interface PlayerInfo { id: string; name: string; teamName?: string; teamColor?: string }

const GAME_LABELS: Record<GameType, string> = {
  bible_quiz: '📖 Bible Quiz',
  verse_scramble: '📝 Verse Scramble',
  emoji_story: '🎭 Emoji Story',
}

export default function HostPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<HostPhase>('configure')
  const [gameType, setGameType] = useState<GameType>('bible_quiz')
  const [mode, setMode] = useState<RoomMode>('individual')
  const [roomCode, setRoomCode] = useState('')
  const [hostToken, setHostToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [teamCount, setTeamCount] = useState(3)
  const [teamsAssigned, setTeamsAssigned] = useState(false)
  const [questionStatus, setQuestionStatus] = useState<'idle' | 'showing' | 'reveal'>('idle')
  const [currentQ, setCurrentQ] = useState(0)
  const [totalQ, setTotalQ] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleEvent = useCallback((e: any) => {
    if (e.event === 'player_joined') {
      setPlayers((prev) => [...prev, { id: e.payload.player_id, name: e.payload.name }])
    } else if (e.event === 'teams_assigned') {
      const updated: PlayerInfo[] = []
      for (const team of e.payload.teams) {
        for (const member of team.members) {
          updated.push({ id: member.id, name: member.name, teamName: team.name, teamColor: team.color })
        }
      }
      setPlayers(updated)
      setTeamsAssigned(true)
    } else if (e.event === 'question_show') {
      setCurrentQ(e.payload.question_index + 1)
      setTotalQ(e.payload.total_questions)
      setQuestionStatus('showing')
    } else if (e.event === 'question_reveal') {
      setQuestionStatus('reveal')
    } else if (e.event === 'game_finished') {
      setPhase('finished')
    }
  }, [])

  useGameChannel(roomCode || null, handleEvent)

  async function handleCreate() {
    setLoading(true)
    try {
      const data = await createRoom(gameType, mode)
      setRoomCode(data.code)
      setHostToken(data.host_token)
      saveHostSession(data.code, { hostToken: data.host_token, roomId: data.room_id })
      setPhase('lobby')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignTeams() {
    setLoading(true)
    try {
      await assignTeams(roomCode, hostToken, teamCount)
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    setLoading(true)
    try {
      const data = await startGame(roomCode, hostToken)
      setSessionId(data.session_id)
      updateHostSession(roomCode, { sessionId: data.session_id })
      setPhase('playing')
    } finally {
      setLoading(false)
    }
  }

  async function handleNext() {
    if (!sessionId) return
    setLoading(true)
    try {
      await nextQuestion(sessionId, hostToken)
    } finally {
      setLoading(false)
    }
  }

  // Configure phase
  if (phase === 'configure') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <h1 className="text-2xl font-bold text-white mb-8">Buat Room</h1>
        <div className="flex flex-col gap-6 max-w-sm">
          <div>
            <p className="text-white/70 text-sm mb-2">Pilih Game</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(GAME_LABELS) as GameType[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGameType(g)}
                  className={`py-3 px-4 rounded-xl font-semibold text-left transition-all ${gameType === g ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
                >
                  {GAME_LABELS[g]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-white/70 text-sm mb-2">Mode</p>
            <div className="flex gap-3">
              {(['individual', 'team'] as RoomMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${mode === m ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}
                >
                  {m === 'individual' ? '👤 Individual' : '👥 Tim'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg disabled:opacity-60 active:scale-95 transition-transform mt-4"
          >
            {loading ? 'Membuat...' : 'Buat Room'}
          </button>
        </div>
      </main>
    )
  }

  // Lobby phase
  if (phase === 'lobby') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-2">
          <div>
            <p className="text-white/60 text-sm">Kode Room</p>
            <h2 className="text-5xl font-black text-white tracking-widest">{roomCode}</h2>
          </div>
        </div>
        <p className="text-blue-200 text-sm mb-6">{GAME_LABELS[gameType]} · {mode === 'individual' ? 'Individual' : 'Tim'}</p>

        <div className="bg-white/10 rounded-2xl p-4 mb-4 flex-1 max-h-64 overflow-y-auto">
          <p className="text-white/60 text-sm mb-2">{players.length} player bergabung</p>
          <div className="flex flex-col gap-1">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-white">
                {p.teamColor && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.teamColor }} />}
                <span>{p.name}</span>
                {p.teamName && <span className="text-white/50 text-xs">{p.teamName}</span>}
              </div>
            ))}
          </div>
        </div>

        {mode === 'team' && (
          <div className="flex items-center gap-3 mb-4">
            <select
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
              className="bg-white/20 text-white rounded-xl px-3 py-2 outline-none"
            >
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} tim</option>)}
            </select>
            <button
              onClick={handleAssignTeams}
              disabled={loading || players.length === 0}
              className="flex-1 bg-white/20 text-white font-semibold py-2 rounded-xl border border-white/30 disabled:opacity-50 active:scale-95"
            >
              {teamsAssigned ? '🔀 Acak Ulang' : '🎲 Acak Tim'}
            </button>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || players.length === 0 || (mode === 'team' && !teamsAssigned)}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Starting...' : '▶ Mulai Game'}
        </button>
        {mode === 'team' && !teamsAssigned && players.length > 0 && (
          <p className="text-yellow-300 text-sm text-center mt-2">Acak tim dulu sebelum mulai</p>
        )}
      </main>
    )
  }

  // Playing phase
  if (phase === 'playing') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-white/60 text-sm">Room {roomCode}</p>
            <p className="text-white font-semibold">{GAME_LABELS[gameType]}</p>
          </div>
          {totalQ > 0 && (
            <p className="text-white/70">Soal {currentQ}/{totalQ}</p>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {questionStatus === 'idle' && (
            <p className="text-white/70 text-center">Tekan tombol untuk mulai soal pertama</p>
          )}
          {questionStatus === 'showing' && (
            <div className="text-center">
              <div className="text-5xl mb-3 animate-pulse">⏱</div>
              <p className="text-white font-semibold">Player sedang menjawab...</p>
              <p className="text-white/50 text-sm mt-1">{players.length} player</p>
            </div>
          )}
          {questionStatus === 'reveal' && (
            <div className="text-center">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-white font-semibold">Semua sudah menjawab!</p>
            </div>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={loading || questionStatus === 'showing'}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-xl disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? '...' : questionStatus === 'idle' ? '▶ Mulai' : '⏭ Soal Berikutnya'}
        </button>
      </main>
    )
  }

  // Finished phase
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-6 flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-4">🏆 Game Selesai!</h1>
      <button
        onClick={() => router.push(`/results/${sessionId}`)}
        className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg active:scale-95 mb-4"
      >
        Lihat Leaderboard
      </button>
      <button
        onClick={() => router.push('/')}
        className="bg-white/20 text-white font-semibold py-3 rounded-xl border border-white/30 active:scale-95"
      >
        Kembali ke Home
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/host/
git commit -m "feat: add host page (configure, lobby, playing, finished)"
```

---

## Task 14: Question Seed Data

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Create `supabase/seed.sql`**

```sql
-- Bible Quiz (10 questions)
insert into questions (game_type, order_index, content) values
('bible_quiz', 0, '{
  "question": "Siapa yang membangun bahtera besar untuk selamat dari banjir besar?",
  "options": ["Nuh", "Musa", "Abraham", "Daud"],
  "answer_index": 0
}'),
('bible_quiz', 1, '{
  "question": "Di kota mana Yesus dilahirkan?",
  "options": ["Nazaret", "Yerusalem", "Betlehem", "Kapernaum"],
  "answer_index": 2
}'),
('bible_quiz', 2, '{
  "question": "Berapa jumlah murid Yesus yang terdekat (rasul)?",
  "options": ["10", "11", "12", "13"],
  "answer_index": 2
}'),
('bible_quiz', 3, '{
  "question": "Siapa yang menjual Yusuf kepada saudagar Ismael seharga 20 keping perak?",
  "options": ["Ruben", "Saudara-saudaranya", "Potifar", "Yakub"],
  "answer_index": 1
}'),
('bible_quiz', 4, '{
  "question": "Kitab apa yang ada di tengah-tengah Alkitab?",
  "options": ["Mazmur", "Amsal", "Ayub", "Pengkhotbah"],
  "answer_index": 0
}'),
('bible_quiz', 5, '{
  "question": "Berapa hari Yesus berpuasa di padang gurun?",
  "options": ["20 hari", "30 hari", "40 hari", "50 hari"],
  "answer_index": 2
}'),
('bible_quiz', 6, '{
  "question": "Siapa yang disebut \"bapa orang beriman\" dalam Alkitab?",
  "options": ["Musa", "Daud", "Abraham", "Yakub"],
  "answer_index": 2
}'),
('bible_quiz', 7, '{
  "question": "Mukjizat pertama Yesus terjadi di mana?",
  "options": ["Betlehem", "Kana", "Yerusalem", "Nazaret"],
  "answer_index": 1
}'),
('bible_quiz', 8, '{
  "question": "Berapa lama Daniel berdoa sehingga ia dimasukkan ke gua singa?",
  "options": ["Setiap hari sekali", "Dua kali sehari", "Tiga kali sehari", "Setiap Jumat"],
  "answer_index": 2
}'),
('bible_quiz', 9, '{
  "question": "Surat apa yang paling panjang dalam Perjanjian Baru?",
  "options": ["1 Korintus", "Roma", "Ibrani", "Lukas"],
  "answer_index": 1
}');

-- Verse Scramble (5 questions, TB translation)
insert into questions (game_type, order_index, content) values
('verse_scramble', 0, '{
  "reference": "Yohanes 3:16",
  "words": ["Karena", "begitu", "besar", "kasih", "Allah", "akan", "dunia", "ini"],
  "correct_order": [0, 1, 2, 3, 4, 5, 6, 7]
}'),
('verse_scramble', 1, '{
  "reference": "Filipi 4:13",
  "words": ["Segala", "perkara", "dapat", "kutanggung", "di", "dalam", "Dia", "yang", "memberi", "kekuatan", "kepadaku"],
  "correct_order": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}'),
('verse_scramble', 2, '{
  "reference": "Mazmur 23:1",
  "words": ["TUHAN", "adalah", "gembalaku", "takkan", "kekurangan", "aku"],
  "correct_order": [0, 1, 2, 3, 4, 5]
}'),
('verse_scramble', 3, '{
  "reference": "Amsal 3:5",
  "words": ["Percayalah", "kepada", "TUHAN", "dengan", "segenap", "hatimu"],
  "correct_order": [0, 1, 2, 3, 4, 5]
}'),
('verse_scramble', 4, '{
  "reference": "Roma 8:28",
  "words": ["Kita", "tahu", "sekarang", "bahwa", "Allah", "turut", "bekerja", "dalam", "segala", "sesuatu"],
  "correct_order": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
}');

-- Emoji Story (5 questions)
insert into questions (game_type, order_index, content) values
('emoji_story', 0, '{
  "emojis": "🌊⛵🌈🕊️",
  "answer": "nuh dan bahtera",
  "hint": "Kejadian 6-9"
}'),
('emoji_story', 1, '{
  "emojis": "🐟🐟🍞🍞🍞👥👥",
  "answer": "mukjizat roti dan ikan",
  "hint": "Yohanes 6"
}'),
('emoji_story', 2, '{
  "emojis": "👶🌟⭐🎁🐑",
  "answer": "kelahiran yesus",
  "hint": "Lukas 2"
}'),
('emoji_story', 3, '{
  "emojis": "🦁😊🙏🌙",
  "answer": "daniel di gua singa",
  "hint": "Daniel 6"
}'),
('emoji_story', 4, '{
  "emojis": "🌊🏃🌊🌊🏃‍♀️🏃‍♂️",
  "answer": "penyeberangan laut merah",
  "hint": "Keluaran 14"
}');
```

- [ ] **Step 2: Apply seed data**

If using local Supabase, seed is applied automatically with `supabase db reset`.

For hosted Supabase:
```bash
supabase db push
# then in Supabase SQL editor, paste and run seed.sql contents
```

Or via CLI:
```bash
psql "$SUPABASE_DB_URL" < supabase/seed.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add seed data for all 3 game types"
```

---

## Task 15: Layout + Deploy

**Files:**
- Modify: `app/layout.tsx`
- Create: `vercel.json`

- [ ] **Step 1: Update `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CG Games',
  description: 'Game seru buat connect group',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Deploy Edge Functions to Supabase**

```bash
supabase functions deploy rooms --no-verify-jwt
supabase functions deploy sessions --no-verify-jwt
```

`--no-verify-jwt` allows unauthenticated calls (we handle auth via tokens in headers).

- [ ] **Step 3: Set Edge Function secrets**

```bash
supabase secrets set SUPABASE_DB_URL="your-db-url"
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase
```

- [ ] **Step 4: Deploy to Vercel**

```bash
npx vercel --prod
# Follow prompts, add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# as environment variables in Vercel dashboard
```

- [ ] **Step 5: Smoke test full flow**

Open the deployed URL on two devices.

**Device 1 (Host):**
1. Tap "Buat Room"
2. Pick Bible Quiz, Individual
3. Note the 6-digit code

**Device 2 (Player):**
1. Tap "Gabung Room"
2. Enter code + name
3. Should appear in host's lobby

**Device 1:**
4. Tap "Mulai Game"
5. Tap "▶ Mulai" to show first question

**Device 2:**
6. Bible Quiz question should appear with options
7. Tap an answer

**Device 1:**
8. "Soal Berikutnya" after all players answered
9. After last question → "Lihat Leaderboard"

Expected: leaderboard shows player name with points.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete CG Games platform v1"
```

---

## Checklist: Spec Coverage

- [x] **3 games** — Bible Quiz (Task 10), Verse Scramble (Task 10), Emoji Story (Task 10)
- [x] **Room system with 6-digit code** — rooms Edge Function (Task 5)
- [x] **Host role, no registration** — host_token in localStorage (Tasks 5, 7, 13)
- [x] **Player guest join** — session_token in localStorage (Tasks 5, 7, 11)
- [x] **Individual mode** — leaderboard by player (Task 6)
- [x] **Team mode with random assignment** — rooms/:code/teams endpoint (Task 5), lobby UI (Task 13)
- [x] **Real-time sync** — Supabase Realtime broadcast + useGameChannel (Tasks 5, 6, 8)
- [x] **Host controls flow** — next question button (Task 13)
- [x] **Leaderboard** — sessions/:id/leaderboard + Results page (Tasks 6, 11)
- [x] **Points system** — scoring logic with tests (Tasks 4, 6)
- [x] **Pre-seeded questions** — seed.sql (Task 14)
- [x] **Deploy via web** — Vercel + Supabase Edge Functions (Task 15)
