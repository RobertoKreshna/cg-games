# Memory Ayat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth game, "Memory Ayat": identical reference cards are matched, and each match opens a 4-option multiple choice for that verse. Everyone plays the same board in parallel on their phone; the server validates and scores.

**Architecture:** Pure rules live in one import-free module (`supabase/functions/_shared/memory.ts`) that the Deno edge functions and the Next.js app both use (same pattern as `_shared/game.ts` ↔ `lib/scoring.ts`). The board is generated server-side when the host starts the question, stored as one `questions` row (so `answers.question_id` keeps its foreign key), and sent to all phones. Phones play locally with a pure reducer and submit a flip/answer log; the server replays it, validates it, and scores it.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase Edge Functions (Deno) + Drizzle, Postgres, Vitest + Testing Library, Playwright (visual checks).

**Spec:** `docs/superpowers/specs/2026-10-28-memory-match-design.md`

> **Catatan commit:** pemilik repo yang menjalankan `git commit`. Di setiap **Checkpoint**, executor berhenti, menjalankan semua pengecekan, dan memberikan pesan commit yang disarankan.

> **Konvensi:** `S` = folder scratch sesi (`/private/tmp/claude-501/-Users-robertokreshna-CG-Tools/1566a0e8-650b-4871-8226-5d0a20f257f5/scratchpad`). Semua perintah dijalankan dari root repo `/Users/robertokreshna/CG Tools`.

---

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `e2e/vitest.config.mts` | Vitest config for server tests (aliases Deno `npm:` imports) |
| `e2e/reset-db.sh` | Recreates a local Postgres DB with migrations + seed |
| `e2e/server.e2e.test.mjs` | Server tests against real edge-function handlers + Postgres |
| `supabase/migrations/20261028000000_memory_match_enum.sql` | New `game_type` value |
| `supabase/migrations/20261028000001_memory_match.sql` | Room config columns, `questions.created_at`, cleanup |
| `supabase/functions/_shared/memory.ts` | Board generation, replay/validation, scoring (pure, import-free) |
| `lib/memory-rules.ts` | Re-export of `_shared/memory.ts` for the app and tests |
| `lib/memory-board.ts` | Client reducer for board state (pure) |
| `components/games/MemoryMatch.tsx` | The board UI + submission |
| `components/games/MemoryQuizSheet.tsx` | Multiple-choice dialog |
| `components/shared/MemoryRecap.tsx` | Per-verse ✓/✗ recap |
| `__tests__/memory-rules.test.ts`, `__tests__/memory-board.test.ts`, `__tests__/memory-quiz-sheet.test.tsx`, `__tests__/memory-match.test.tsx`, `__tests__/memory-recap.test.tsx` | Unit/component tests |

**Modify**
`package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `supabase/functions/_shared/game.ts`, `supabase/functions/_shared/schema.ts`, `supabase/functions/rooms/index.ts`, `supabase/functions/sessions/index.ts`, `types/game.ts`, `lib/api.ts`, `lib/play-state.ts`, `lib/realtime.ts`, `app/play/[roomCode]/page.tsx`, `app/host/page.tsx`, `components/shared/HostQuestionCard.tsx`, `__tests__/game.test.ts`, `__tests__/host-question-card.test.tsx`, `README.md`.

---

## Task 1: Bring the server test harness into the repo

The server tests currently live outside the repo (scratch). The memory feature needs server-side tests, so they move in first.

**Files:**
- Create: `e2e/vitest.config.mts`, `e2e/reset-db.sh`, `e2e/server.e2e.test.mjs`
- Modify: `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Re-add the two packages the handlers import (as dev dependencies)**

Run: `npm i -D drizzle-orm@0.45.2 postgres@3.4.9`
Expected: `added ... packages`, no errors.

- [ ] **Step 2: Create `e2e/vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Runs the real Deno edge-function handlers under Node: `npm:` specifiers are mapped to node_modules.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/**/*.e2e.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: /^npm:drizzle-orm(.*)$/, replacement: resolve(__dirname, '../node_modules/drizzle-orm') + '$1' },
      { find: /^npm:postgres$/, replacement: resolve(__dirname, '../node_modules/postgres/src/index.js') },
    ],
  },
  ssr: { noExternal: [/drizzle-orm/, /postgres/] },
})
```

- [ ] **Step 3: Create `e2e/reset-db.sh`**

```bash
#!/usr/bin/env bash
# Recreates the e2e database and applies every migration plus the seed.
# Needs a reachable Postgres. Default target matches `pg_ctl ... -p 54999` on localhost.
set -euo pipefail

DB_URL="${E2E_DB_URL:-postgresql://postgres@127.0.0.1:54999/cg}"
ADMIN_URL="${DB_URL%/*}/postgres"
DB_NAME="${DB_URL##*/}"

psql "$ADMIN_URL" -q -c "drop database if exists $DB_NAME" -c "create database $DB_NAME"
# Supabase has these roles; a plain Postgres does not (the hardening migration revokes from them).
psql "$DB_URL" -q -c "do \$\$ begin create role anon nologin; exception when duplicate_object then null; end \$\$;" \
                  -c "do \$\$ begin create role authenticated nologin; exception when duplicate_object then null; end \$\$;"

for f in supabase/migrations/*.sql supabase/seed.sql; do
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "e2e database ready: $DB_URL"
```

Run: `chmod +x e2e/reset-db.sh`

- [ ] **Step 4: Move the existing server tests in and fix their paths**

```bash
cp "/private/tmp/claude-501/-Users-robertokreshna-CG-Tools/1566a0e8-650b-4871-8226-5d0a20f257f5/scratchpad/it/e2e.test.mjs" e2e/server.e2e.test.mjs
python3 - <<'EOF'
import re
p='e2e/server.e2e.test.mjs'
s=open(p).read()
s=re.sub(r"import pg from '[^']*postgres/src/index\.js'", "import pg from 'postgres'", s)
s=s.replace("const DB = 'postgresql://postgres@127.0.0.1:54999/cg'","const DB = process.env.E2E_DB_URL ?? 'postgresql://postgres@127.0.0.1:54999/cg'")
s=s.replace("'/Users/robertokreshna/CG Tools/supabase/","'../supabase/")
open(p,'w').write(s)
EOF
grep -n "/Users/\|/private/tmp" e2e/server.e2e.test.mjs || echo "no absolute paths left"
```
Expected: `no absolute paths left`.

- [ ] **Step 5: Add the script and keep the e2e files out of the normal unit run**

In `package.json` add to `"scripts"`:
```json
"test:e2e": "vitest run --config e2e/vitest.config.mts"
```
In `vitest.config.ts`, inside `test: { ... }` add:
```ts
    exclude: ['e2e/**', 'node_modules/**'],
```

- [ ] **Step 6: Run both suites**

```bash
bash e2e/reset-db.sh
npm run test:e2e
npm run test:run
```
Expected: `test:e2e` → `Tests  45 passed (45)`; `test:run` → `Tests  76 passed (76)` (e2e files not picked up).
If Postgres is not running: `pg_ctl -D "$S/pgdata" -o "-p 54999 -k /tmp" -l "$S/pg.log" start` (re-`initdb -U postgres --auth=trust` first if the data dir is gone).

- [ ] **Step 7: Add a CI job for the server tests**

Append to `.github/workflows/ci.yml` under `jobs:` (same indentation as `check:`):

```yaml
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      E2E_DB_URL: postgresql://postgres:postgres@localhost:5432/cg
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: bash e2e/reset-db.sh
      - run: npm run test:e2e
```

- [ ] **Step 8: Checkpoint**

Suggested commit: `test: move server e2e tests into the repo and run them in CI`

---

## Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/20261028000000_memory_match_enum.sql`, `supabase/migrations/20261028000001_memory_match.sql`

- [ ] **Step 1: Create the enum migration (its own file: a new enum value cannot be used in the transaction that adds it)**

`supabase/migrations/20261028000000_memory_match_enum.sql`:
```sql
alter type game_type add value if not exists 'memory_match';
```

- [ ] **Step 2: Create the schema migration**

`supabase/migrations/20261028000001_memory_match.sql`:
```sql
-- Memory Ayat: per-room configuration.
alter table rooms
  add column memory_cards int not null default 20 check (memory_cards in (12, 20, 30, 40)),
  add column memory_delay_ms int not null default 1000 check (memory_delay_ms in (500, 1000, 2000, 3000));

-- Boards are generated per game and stored as questions rows; created_at lets cleanup remove old ones.
alter table questions
  add column created_at timestamptz not null default now();

-- Same job as before (delete old rooms, cascading), plus the generated boards of that age.
create or replace function cleanup_old_rooms(max_age interval default interval '7 days')
returns integer
language sql
as $$
  with boards as (
    delete from questions where game_type = 'memory_match' and created_at < now() - max_age returning 1
  ), deleted as (
    delete from rooms where created_at < now() - max_age returning 1
  )
  select count(*)::int from deleted;
$$;
```

- [ ] **Step 3: Apply to the local database and verify**

```bash
bash e2e/reset-db.sh
psql postgresql://postgres@127.0.0.1:54999/cg -At -c "select enum_range(null::game_type)" \
  -c "select column_name||' '||column_default from information_schema.columns where table_name='rooms' and column_name like 'memory_%' order by 1" \
  -c "select count(*) from information_schema.columns where table_name='questions' and column_name='created_at'"
```
Expected output contains `memory_match` in the enum list, `memory_cards 20`, `memory_delay_ms 1000`, and `1`.

- [ ] **Step 4: Verify the cleanup removes old boards only**

```bash
psql postgresql://postgres@127.0.0.1:54999/cg -At \
  -c "insert into questions (game_type, order_index, content, created_at) values ('memory_match', 0, '{}', now() - interval '10 days'), ('memory_match', 0, '{}', now())" \
  -c "select cleanup_old_rooms()" \
  -c "select count(*) from questions where game_type='memory_match'"
```
Expected: the final count is `1` (the fresh board survives, the 10-day-old one is gone). Then run `bash e2e/reset-db.sh` to clean up.

- [ ] **Step 5: Checkpoint**

Suggested commit: `feat(db): memory_match game type, room config columns and board cleanup`
Reminder for rollout: these must be applied (`supabase db push`) **before** the functions that use them are deployed.

---

## Task 3: Memory rules (pure module) — tests first

**Files:**
- Create: `supabase/functions/_shared/memory.ts`, `lib/memory-rules.ts`
- Test: `__tests__/memory-rules.test.ts`

- [ ] **Step 1: Create the re-export (so tests and the app import it as `@/lib/memory-rules`)**

`lib/memory-rules.ts`:
```ts
// Game rules for Memory Ayat live in one place and are shared with the edge functions.
export * from '../supabase/functions/_shared/memory'
```

- [ ] **Step 2: Write the failing tests**

`__tests__/memory-rules.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  buildBoard, replayMemory, scoreMemory, scoreMemoryAnswer, minMemoryTimeMs, memoryTimerMs, memoryCols,
  isMemoryCardCount, isMemoryDelay, MEMORY_CARD_COUNTS, MEMORY_DELAYS_MS,
  type MemoryBoard, type MemoryVerse,
} from '@/lib/memory-rules'

// Small deterministic PRNG so shuffles are repeatable.
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const verses: MemoryVerse[] = Array.from({ length: 40 }, (_, i) => ({
  reference: `Kitab ${i + 1}:${i + 1}`,
  text: `Bunyi ayat nomor ${i + 1} yang cukup panjang`,
}))

/** A flip/answer log that finds every pair; `mistakes` adds deliberate mismatches first. */
function play(board: MemoryBoard, { mistakes = 0, answered = board.quiz.length, correct = true } = {}) {
  const ids = new Map<number, number[]>()
  board.cards.forEach((c) => ids.set(c.pair, [...(ids.get(c.pair) ?? []), c.id]))
  const f: number[] = []
  for (let m = 0; m < mistakes; m++) f.push(ids.get(0)![0], ids.get(1)![0])
  const q: [number, number][] = []
  for (let pair = 0; pair < board.quiz.length; pair++) {
    f.push(...ids.get(pair)!)
    if (pair < answered) {
      const answer = board.quiz.find((x) => x.pair === pair)!.answer
      q.push([pair, correct ? answer : (answer + 1) % 4])
    }
  }
  return { f, q }
}

describe('constants and helpers', () => {
  it('offers the configured sizes and delays', () => {
    expect([...MEMORY_CARD_COUNTS]).toEqual([12, 20, 30, 40])
    expect([...MEMORY_DELAYS_MS]).toEqual([500, 1000, 2000, 3000])
    expect(isMemoryCardCount(20)).toBe(true)
    expect(isMemoryCardCount(18)).toBe(false)
    expect(isMemoryCardCount('20')).toBe(false)
    expect(isMemoryDelay(1000)).toBe(true)
    expect(isMemoryDelay(1500)).toBe(false)
  })
  it('lays out columns and sizes the timer from the card count', () => {
    expect([12, 20, 30, 40].map(memoryCols)).toEqual([3, 4, 5, 5])
    expect(memoryTimerMs(12)).toBe(80_000)
    expect(memoryTimerMs(20)).toBe(120_000)
    expect(memoryTimerMs(40)).toBe(220_000)
  })
})

describe('buildBoard', () => {
  it.each([12, 20, 30, 40])('builds %i cards: every reference appears on exactly two cards', (count) => {
    const board = buildBoard(verses, count, 1000, seeded(count))
    expect(board.cards).toHaveLength(count)
    expect(board.quiz).toHaveLength(count / 2)
    expect(board.cards.map((c) => c.id)).toEqual(Array.from({ length: count }, (_, i) => i))
    const perPair = new Map<number, string[]>()
    board.cards.forEach((c) => perPair.set(c.pair, [...(perPair.get(c.pair) ?? []), c.text]))
    expect(perPair.size).toBe(count / 2)
    for (const texts of perPair.values()) {
      expect(texts).toHaveLength(2)
      expect(texts[0]).toBe(texts[1])
    }
    expect(board.cols).toBe(memoryCols(count))
    expect(board.hideMs).toBe(1000)
    expect(board.timerMs).toBe(memoryTimerMs(count))
  })

  it('never repeats a verse on one board', () => {
    const board = buildBoard(verses, 40, 500, seeded(7))
    const refs = new Set(board.cards.map((c) => c.text))
    expect(refs.size).toBe(20)
  })

  it('gives each pair 4 distinct options, with `answer` pointing at the right verse', () => {
    const board = buildBoard(verses, 20, 1000, seeded(3))
    for (const quiz of board.quiz) {
      const reference = board.cards.find((c) => c.pair === quiz.pair)!.text
      const verse = verses.find((v) => v.reference === reference)!
      expect(quiz.options).toHaveLength(4)
      expect(new Set(quiz.options).size).toBe(4)
      expect(quiz.options[quiz.answer]).toBe(verse.text)
      expect(quiz.options.filter((o) => o === verse.text)).toHaveLength(1)
    }
  })

  it('is deterministic for a given random source and different for another', () => {
    const a = buildBoard(verses, 20, 1000, seeded(1))
    const b = buildBoard(verses, 20, 1000, seeded(1))
    const c = buildBoard(verses, 20, 1000, seeded(2))
    expect(a).toEqual(b)
    expect(a.cards.map((x) => x.text)).not.toEqual(c.cards.map((x) => x.text))
  })

  it('ignores verses that repeat a reference or a text', () => {
    const dupes = [...verses, { reference: verses[0].reference, text: 'other text' }, { reference: 'Zzz 1:1', text: verses[1].text }]
    const board = buildBoard(dupes, 40, 1000, seeded(5))
    expect(new Set(board.cards.map((c) => c.text)).size).toBe(20)
  })

  it('rejects an unsupported size, delay, or a pool that is too small', () => {
    expect(() => buildBoard(verses, 18, 1000)).toThrow(/card count/)
    expect(() => buildBoard(verses, 20, 1500)).toThrow(/delay/)
    expect(() => buildBoard(verses.slice(0, 12), 20, 1000)).toThrow(/enough verses/)
  })
})

describe('replayMemory', () => {
  const board = buildBoard(verses, 12, 1000, seeded(11))
  const pairs = 6

  it('counts a perfect game', () => {
    const r = replayMemory(board, play(board))
    expect(r).toEqual({ ok: true, matched: pairs, mistakes: 0, moves: pairs, answered: pairs, correct: pairs, complete: true, pairs })
  })

  it('counts mistakes, wrong answers and partial answers', () => {
    const r = replayMemory(board, play(board, { mistakes: 3, answered: 4, correct: false }))
    expect(r).toMatchObject({ ok: true, matched: pairs, mistakes: 3, moves: pairs + 3, answered: 4, correct: 0, complete: true })
  })

  it('ignores a trailing flip that has no partner (time ran out mid-move)', () => {
    const log = play(board)
    const partial = { f: [...log.f.slice(0, 4), log.f[4]], q: log.q.slice(0, 2) }
    expect(replayMemory(board, partial)).toMatchObject({ ok: true, matched: 2, moves: 2, complete: false })
  })

  it('accepts an empty log', () => {
    expect(replayMemory(board, { f: [], q: [] })).toMatchObject({ ok: true, matched: 0, moves: 0, complete: false })
  })

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['flips missing', { q: [] }],
    ['answers missing', { f: [] }],
    ['flips not integers', { f: [0, 1.5], q: [] }],
    ['flips not numbers', { f: ['a', 'b'], q: [] }],
    ['card out of range (high)', { f: [0, 99], q: [] }],
    ['card out of range (negative)', { f: [-1, 0], q: [] }],
    ['same card twice in a move', { f: [0, 0], q: [] }],
    ['malformed answer entry', { f: [], q: [[1]] }],
    ['answer for a pair that is not matched', { f: [], q: [[0, 1]] }],
    ['too many flips', { f: Array.from({ length: 12 * 6 + 2 }, (_, i) => i % 2), q: [] }],
  ])('rejects %s', (_label, result) => {
    expect(replayMemory(board, result).ok).toBe(false)
  })

  it('rejects flipping a card that is already matched', () => {
    const log = play(board)
    expect(replayMemory(board, { f: [...log.f.slice(0, 2), log.f[0], log.f[2]], q: [] }).ok).toBe(false)
  })

  it('rejects answering a pair twice and options outside 0..3', () => {
    const log = play(board)
    expect(replayMemory(board, { f: log.f, q: [log.q[0], log.q[0]] }).ok).toBe(false)
    expect(replayMemory(board, { f: log.f, q: [[0, 4]] }).ok).toBe(false)
    expect(replayMemory(board, { f: log.f, q: [[0, -1]] }).ok).toBe(false)
  })
})

describe('scoreMemory', () => {
  const full = { matched: 10, correct: 10, mistakes: 0, pairs: 10 }
  it('gives 1000 for a perfect instant game and 500 at the time limit', () => {
    expect(scoreMemory(full, 0, 120_000)).toBe(1000)
    expect(scoreMemory(full, 120_000, 120_000)).toBe(500)
  })
  it('splits the base 50/50 between finding pairs and answering', () => {
    expect(scoreMemory({ ...full, correct: 0 }, 0, 120_000)).toBe(500)
    expect(scoreMemory({ ...full, matched: 0, correct: 0 }, 0, 120_000)).toBe(0)
  })
  it('matches the worked example: 60s of 120s, 4 mistakes, 8/10 right', () => {
    expect(scoreMemory({ matched: 10, correct: 8, mistakes: 4, pairs: 10 }, 60_000, 120_000)).toBe(595)
  })
  it('never goes below zero and clamps time to the limit', () => {
    expect(scoreMemory({ matched: 1, correct: 0, mistakes: 50, pairs: 10 }, 0, 120_000)).toBe(0)
    expect(scoreMemory(full, 999_999, 120_000)).toBe(500)
  })
  it('computes the minimum plausible time', () => {
    expect(minMemoryTimeMs(10, 10)).toBe(15_000)
    expect(minMemoryTimeMs(0, 0)).toBe(0)
  })
})

describe('scoreMemoryAnswer', () => {
  const board = buildBoard(verses, 12, 1000, seeded(13))
  it('scores a valid perfect result and floors an impossibly fast time', () => {
    const fast = scoreMemoryAnswer(board, JSON.stringify(play(board)), 0)
    // 6 moves + 6 answers => 9000ms floor of 80000: factor 1 - 0.5*0.1125 = 0.94375 => 944
    expect(fast).toEqual({ ok: true, isCorrect: true, points: 944 })
    const honest = scoreMemoryAnswer(board, JSON.stringify(play(board)), 20_000)
    expect(honest).toEqual({ ok: true, isCorrect: true, points: 875 })
  })
  it('marks an incomplete game as not correct but still scores it', () => {
    const log = play(board)
    const r = scoreMemoryAnswer(board, JSON.stringify({ f: log.f.slice(0, 4), q: log.q.slice(0, 2) }), 30_000)
    expect(r).toMatchObject({ ok: true, isCorrect: false })
    expect((r as { points: number }).points).toBeGreaterThan(0)
  })
  it('rejects JSON that is invalid or fails the replay', () => {
    expect(scoreMemoryAnswer(board, 'not json', 0)).toEqual({ ok: false, error: 'invalid answer format' })
    expect(scoreMemoryAnswer(board, JSON.stringify({ f: [0, 99], q: [] }), 0)).toEqual({ ok: false, error: 'invalid answer format' })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run __tests__/memory-rules.test.ts`
Expected: FAIL — cannot resolve `../supabase/functions/_shared/memory` (module not found).

- [ ] **Step 4: Implement `supabase/functions/_shared/memory.ts`**

```ts
// Rules for Memory Ayat. Pure TypeScript with no imports so it runs in Deno (edge functions) and in
// Next.js (lib/memory-rules.ts re-exports it), like _shared/game.ts.

export const MEMORY_CARD_COUNTS = [12, 20, 30, 40] as const
export const MEMORY_DELAYS_MS = [500, 1000, 2000, 3000] as const
export const MEMORY_DEFAULT_CARDS = 20
export const MEMORY_DEFAULT_DELAY_MS = 1000

/** Time budget: this much per pair (matching + answering) plus a fixed amount. */
export const MEMORY_MS_PER_PAIR = 10_000
export const MEMORY_BASE_MS = 20_000
export const MEMORY_MISTAKE_PENALTY = 20
/** No human can finish faster than this per move / per answered quiz; shorter claimed times are raised. */
export const MEMORY_MIN_MS_PER_MOVE = 500
export const MEMORY_MIN_MS_PER_ANSWER = 1000
/** A result may contain at most this many flips per card (rejects absurdly long logs). */
export const MEMORY_MAX_FLIPS_PER_CARD = 6
export const MEMORY_OPTIONS = 4

export interface MemoryVerse { reference: string; text: string }
export interface MemoryCard { id: number; pair: number; text: string }
export interface MemoryQuiz { pair: number; options: string[]; answer: number }
export interface MemoryBoard {
  cols: number
  hideMs: number
  timerMs: number
  cards: MemoryCard[]
  quiz: MemoryQuiz[]
}
/** What a phone submits: flips in order (two per move) and `[pair, option]` for each answered quiz. */
export interface MemoryResult { f: number[]; q: [number, number][] }

export type MemoryReplay =
  | { ok: true; matched: number; mistakes: number; moves: number; answered: number; correct: number; complete: boolean; pairs: number }
  | { ok: false; error: string }

export type MemoryScore =
  | { ok: true; isCorrect: boolean; points: number }
  | { ok: false; error: string }

const COLS: Record<number, number> = { 12: 3, 20: 4, 30: 5, 40: 5 }

export function isMemoryCardCount(n: unknown): n is 12 | 20 | 30 | 40 {
  return (MEMORY_CARD_COUNTS as readonly unknown[]).includes(n)
}

export function isMemoryDelay(n: unknown): n is 500 | 1000 | 2000 | 3000 {
  return (MEMORY_DELAYS_MS as readonly unknown[]).includes(n)
}

export function memoryCols(cardCount: number): number {
  return COLS[cardCount]
}

export function memoryTimerMs(cardCount: number): number {
  return (cardCount / 2) * MEMORY_MS_PER_PAIR + MEMORY_BASE_MS
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Builds one board: pairs of identical reference cards plus a 4-option quiz per pair. */
export function buildBoard(
  verses: readonly MemoryVerse[],
  cardCount: number,
  hideMs: number,
  random: () => number = Math.random,
): MemoryBoard {
  if (!isMemoryCardCount(cardCount)) throw new Error(`invalid card count: ${cardCount}`)
  if (!isMemoryDelay(hideMs)) throw new Error(`invalid delay: ${hideMs}`)

  // A repeated reference would make a pair ambiguous; a repeated text could appear twice among options.
  const unique: MemoryVerse[] = []
  const seenReference = new Set<string>()
  const seenText = new Set<string>()
  for (const verse of verses) {
    if (seenReference.has(verse.reference) || seenText.has(verse.text)) continue
    seenReference.add(verse.reference)
    seenText.add(verse.text)
    unique.push(verse)
  }

  const pairs = cardCount / 2
  if (unique.length < pairs + MEMORY_OPTIONS - 1) throw new Error('not enough verses for this board')

  const chosen = shuffled(unique, random).slice(0, pairs)
  const quiz: MemoryQuiz[] = chosen.map((verse, pair) => {
    const wrong = shuffled(unique.filter((v) => v.text !== verse.text), random)
      .slice(0, MEMORY_OPTIONS - 1)
      .map((v) => v.text)
    const options = shuffled([verse.text, ...wrong], random)
    return { pair, options, answer: options.indexOf(verse.text) }
  })
  const cards: MemoryCard[] = shuffled(
    chosen.flatMap((verse, pair) => [{ pair, text: verse.reference }, { pair, text: verse.reference }]),
    random,
  ).map((card, id) => ({ id, ...card }))

  return { cols: memoryCols(cardCount), hideMs, timerMs: memoryTimerMs(cardCount), cards, quiz }
}

const isInt = (v: unknown): v is number => Number.isInteger(v)

/** Replays a submitted log against the board and validates it. */
export function replayMemory(board: MemoryBoard, result: unknown): MemoryReplay {
  const bad = (error: string): MemoryReplay => ({ ok: false, error })
  if (typeof result !== 'object' || result === null) return bad('invalid result')
  const { f, q } = result as { f?: unknown; q?: unknown }
  if (!Array.isArray(f) || !f.every(isInt)) return bad('invalid flips')
  if (!Array.isArray(q) || !q.every((e) => Array.isArray(e) && e.length === 2 && isInt(e[0]) && isInt(e[1]))) {
    return bad('invalid answers')
  }

  const cardCount = board.cards.length
  const pairs = board.quiz.length
  if (f.length > cardCount * MEMORY_MAX_FLIPS_PER_CARD) return bad('too many flips')

  const matched = new Set<number>()
  let mistakes = 0
  let moves = 0
  // Flips are read in twos; a trailing unpaired flip (time ran out mid-move) is ignored.
  for (let i = 0; i + 1 < f.length; i += 2) {
    const a = f[i]
    const b = f[i + 1]
    if (a < 0 || a >= cardCount || b < 0 || b >= cardCount) return bad('card out of range')
    if (a === b) return bad('same card twice')
    const pairA = board.cards[a].pair
    const pairB = board.cards[b].pair
    if (matched.has(pairA) || matched.has(pairB)) return bad('card already matched')
    moves++
    if (pairA === pairB) matched.add(pairA)
    else mistakes++
  }

  const answeredPairs = new Set<number>()
  let correct = 0
  for (const [pair, option] of q as [number, number][]) {
    if (!matched.has(pair)) return bad('answer for a pair that is not matched')
    if (answeredPairs.has(pair)) return bad('pair answered twice')
    if (option < 0 || option >= MEMORY_OPTIONS) return bad('option out of range')
    answeredPairs.add(pair)
    if (board.quiz.find((x) => x.pair === pair)?.answer === option) correct++
  }

  return {
    ok: true, matched: matched.size, mistakes, moves, answered: answeredPairs.size, correct,
    complete: matched.size === pairs, pairs,
  }
}

/** Half the base comes from finding pairs, half from right answers; speed scales it from 1.0 to 0.5. */
export function scoreMemory(
  r: { matched: number; correct: number; mistakes: number; pairs: number },
  timeMs: number,
  timerMs: number,
): number {
  const base = 500 * (r.matched / r.pairs) + 500 * (r.correct / r.pairs)
  const used = Math.min(1, Math.max(0, timeMs / timerMs))
  return Math.max(0, Math.round(base * (1 - 0.5 * used)) - MEMORY_MISTAKE_PENALTY * r.mistakes)
}

export function minMemoryTimeMs(moves: number, answered: number): number {
  return moves * MEMORY_MIN_MS_PER_MOVE + answered * MEMORY_MIN_MS_PER_ANSWER
}

/** Validates and scores a submitted answer string for a stored board. `timeMs` is the already-trusted time. */
export function scoreMemoryAnswer(content: unknown, submitted: string, timeMs: number): MemoryScore {
  const failure: MemoryScore = { ok: false, error: 'invalid answer format' }
  let parsed: unknown
  try { parsed = JSON.parse(submitted) } catch { return failure }
  const board = content as MemoryBoard
  const replay = replayMemory(board, parsed)
  if (!replay.ok) return failure
  const time = Math.min(board.timerMs, Math.max(timeMs, minMemoryTimeMs(replay.moves, replay.answered)))
  return { ok: true, isCorrect: replay.complete, points: scoreMemory(replay, time, board.timerMs) }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run __tests__/memory-rules.test.ts`
Expected: PASS (all tests in the file). If the `'too many flips'` row fails because the log happens to be rejected earlier for another reason, that is still `ok: false` and passes.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Checkpoint**

Suggested commit: `feat: memory match rules (board generation, replay validation, scoring)`

---

## Task 4: Extend the shared game module

**Files:**
- Modify: `supabase/functions/_shared/game.ts`
- Test: `__tests__/game.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `__tests__/game.test.ts` (add the new names to the existing import from `@/lib/scoring`: `timerMsOf, maxAnswerLength, GAME_TYPES, MAX_ANSWER_LENGTH, MAX_MEMORY_ANSWER_LENGTH`):

```ts
describe('memory_match support in the shared rules', () => {
  it('is a known game type with a fallback timer', () => {
    expect(GAME_TYPES).toContain('memory_match')
    expect(TIMER_MS.memory_match).toBe(220_000)
  })
  it('timerMsOf prefers the timer stored in the content, else the per-game default', () => {
    expect(timerMsOf('memory_match', { timerMs: 80_000 })).toBe(80_000)
    expect(timerMsOf('memory_match', {})).toBe(TIMER_MS.memory_match)
    expect(timerMsOf('bible_quiz', { question: 'q' })).toBe(TIMER_MS.bible_quiz)
    expect(timerMsOf('bible_quiz', null)).toBe(TIMER_MS.bible_quiz)
    expect(timerMsOf('memory_match', { timerMs: 0 })).toBe(TIMER_MS.memory_match)
    expect(timerMsOf('memory_match', { timerMs: '9' })).toBe(TIMER_MS.memory_match)
  })
  it('correctAnswerOf returns the right option per pair', () => {
    const content = { quiz: [{ pair: 0, options: ['a', 'b', 'c', 'd'], answer: 2 }, { pair: 1, options: ['a', 'b', 'c', 'd'], answer: 0 }] }
    expect(correctAnswerOf('memory_match', content)).toEqual([2, 0])
    expect(correctAnswerOf('memory_match', {})).toEqual([])
  })
  it('allows longer answers only for memory_match', () => {
    expect(maxAnswerLength('bible_quiz')).toBe(MAX_ANSWER_LENGTH)
    expect(maxAnswerLength('memory_match')).toBe(MAX_MEMORY_ANSWER_LENGTH)
    expect(MAX_MEMORY_ANSWER_LENGTH).toBeGreaterThan(MAX_ANSWER_LENGTH)
  })
})
```
(If `TIMER_MS` / `correctAnswerOf` are not already imported at the top of the file, add them to the same import.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/game.test.ts`
Expected: FAIL (`timerMsOf` / `maxAnswerLength` is not a function, or type errors for `'memory_match'`).

- [ ] **Step 3: Edit `supabase/functions/_shared/game.ts`**

Change the type and lists at the top:
```ts
export type GameType = 'bible_quiz' | 'verse_scramble' | 'emoji_story' | 'memory_match'

export const GAME_TYPES: GameType[] = ['bible_quiz', 'verse_scramble', 'emoji_story', 'memory_match']
export const ROOM_MODES = ['individual', 'team'] as const

export const TIMER_MS: Record<GameType, number> = {
  bible_quiz: 15000,
  verse_scramble: 30000,
  emoji_story: 20000,
  // Fallback only (largest board): a memory board stores its own `timerMs`, see timerMsOf.
  memory_match: 220000,
}

/** The timer for a question: the one stored in its content if any (memory boards), else the game default. */
export function timerMsOf(gameType: GameType, content: unknown): number {
  const stored = (content as { timerMs?: unknown } | null)?.timerMs
  return typeof stored === 'number' && stored > 0 ? stored : TIMER_MS[gameType]
}

export const MAX_ANSWER_LENGTH = 500
export const MAX_MEMORY_ANSWER_LENGTH = 2000

export function maxAnswerLength(gameType: GameType): number {
  return gameType === 'memory_match' ? MAX_MEMORY_ANSWER_LENGTH : MAX_ANSWER_LENGTH
}
```
(Keep the rest of the existing constants — `MAX_PLAYERS_PER_ROOM`, etc. — exactly as they are.) Replace the body of `correctAnswerOf` with:
```ts
export function correctAnswerOf(gameType: GameType, content: unknown): unknown {
  const c = content as Content
  if (gameType === 'bible_quiz') return c.answer_index
  if (gameType === 'verse_scramble') return c.correct_order
  if (gameType === 'memory_match') {
    return Array.isArray(c.quiz) ? (c.quiz as { answer: number }[]).map((q) => q.answer) : []
  }
  return c.correct
}
```
At the start of `scoreAnswer`, add a guard so memory never falls into the array-parsing path:
```ts
  // Memory boards are scored by scoreMemoryAnswer (see _shared/memory.ts).
  if (gameType === 'memory_match') return { ok: false, error: 'invalid answer format' }
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run __tests__/game.test.ts && npx tsc --noEmit`
Expected: tests pass. `tsc` will now report errors where `GameType` is a closed union elsewhere (e.g. `types/game.ts`, host page `GAME_OPTIONS`) — note them; they are fixed in Tasks 5, 8, 9. If `tsc` shows only errors in files listed in those tasks, continue.

- [ ] **Step 5: Checkpoint**

Suggested commit: `feat: teach the shared game rules about memory_match (timer, answer length, correct answers)`

---

## Task 5: Server wiring (schema, rooms, sessions) with server tests

**Files:**
- Modify: `supabase/functions/_shared/schema.ts`, `supabase/functions/rooms/index.ts`, `supabase/functions/sessions/index.ts`, `types/game.ts`
- Test: `e2e/server.e2e.test.mjs`

- [ ] **Step 1: Extend the `setup` helper in the server tests to pass extra room config**

In `e2e/server.e2e.test.mjs` replace
```js
async function setup({ game = 'bible_quiz', mode = 'individual', count = 3, names = ['Ann', 'Bob'] } = {}) {
  const r = await call('rooms', 'POST', '', { body: { game_type: game, mode, question_count: count } })
```
with
```js
async function setup({ game = 'bible_quiz', mode = 'individual', count = 3, names = ['Ann', 'Bob'], config = {} } = {}) {
  const r = await call('rooms', 'POST', '', { body: { game_type: game, mode, question_count: count, ...config } })
```

- [ ] **Step 2: Write the failing server tests** — append to `e2e/server.e2e.test.mjs`:

```js
describe('memory match (server)', () => {
  const memSetup = (config = {}, names = ['Ann', 'Bob']) =>
    setup({ game: 'memory_match', names, config: { memory_cards: 12, memory_delay_ms: 500, ...config } })

  /** Flips + answers that find every pair; `mistakes` adds mismatches first; `answered` limits the quiz answers. */
  function playLog(board, { mistakes = 0, answered = board.quiz.length, correct = true } = {}) {
    const ids = new Map()
    board.cards.forEach((c) => ids.set(c.pair, [...(ids.get(c.pair) ?? []), c.id]))
    const f = [], q = []
    for (let m = 0; m < mistakes; m++) f.push(ids.get(0)[0], ids.get(1)[0])
    for (let pair = 0; pair < board.quiz.length; pair++) {
      f.push(...ids.get(pair))
      if (pair < answered) {
        const a = board.quiz.find((x) => x.pair === pair).answer
        q.push([pair, correct ? a : (a + 1) % 4])
      }
    }
    return { f, q }
  }

  it('validates the room config and forces a single board', async () => {
    const make = (body) => call('rooms', 'POST', '', { body: { game_type: 'memory_match', ...body } })
    expect((await make({ memory_cards: 18 })).status).toBe(400)
    expect((await make({ memory_cards: '20' })).status).toBe(400)
    expect((await make({ memory_delay_ms: 1500 })).status).toBe(400)
    const ok = await make({ memory_cards: 12, memory_delay_ms: 500, question_count: 9 })
    expect(ok.status).toBe(200)
    const [row] = await sql`select question_count, memory_cards, memory_delay_ms from rooms where code = ${ok.body.code}`
    expect(row).toEqual({ question_count: 1, memory_cards: 12, memory_delay_ms: 500 })
    const defaults = await make({})
    const [d] = await sql`select memory_cards, memory_delay_ms from rooms where code = ${defaults.body.code}`
    expect(d).toEqual({ memory_cards: 20, memory_delay_ms: 1000 })
    // other games ignore the memory fields
    expect((await call('rooms', 'POST', '', { body: { game_type: 'bible_quiz', memory_cards: 18 } })).status).toBe(200)
  })

  it('creates one stored board, sends it to everyone, and every player sees the same cards', async () => {
    const { room, players } = await memSetup()
    const sid = await start(room)
    const before = (await sql`select count(*)::int n from questions where game_type = 'memory_match'`)[0].n
    broadcasts.length = 0
    expect((await next(sid, room)).status).toBe(200)
    expect((await sql`select count(*)::int n from questions where game_type = 'memory_match'`)[0].n).toBe(before + 1)
    const shown = events('question_show').at(-1).payload
    expect(shown.game_type).toBe('memory_match')
    expect(shown.total_questions).toBe(1)
    expect(shown.content).toMatchObject({ cols: 3, hideMs: 500, timerMs: 80_000 })
    expect(shown.content.cards).toHaveLength(12)
    expect(shown.content.quiz).toHaveLength(6)
    const stateA = await call('rooms', 'GET', `/${room.code}/state`, { headers: players[0].h })
    const stateB = await call('rooms', 'GET', `/${room.code}/state`, { headers: players[1].h })
    expect(stateA.body.current_question.content.cards).toEqual(shown.content.cards)
    expect(stateB.body.current_question.content.cards).toEqual(shown.content.cards)
    const [{ question_ids }] = await sql`select question_ids from game_sessions where id = ${sid}`
    expect(question_ids).toHaveLength(1)
  })

  it('every pair has two identical reference cards and the quiz answer is that verse', async () => {
    const { room } = await memSetup({ memory_cards: 20 })
    const sid = await start(room); await next(sid, room)
    const board = (await currentQ(sid)).content
    const verses = await sql`select content from questions where game_type = 'verse_scramble'`
    const textByRef = new Map(verses.map(({ content }) => [content.reference, content.correct_order.map((i) => content.words[i]).join(' ')]))
    for (const quiz of board.quiz) {
      const refs = board.cards.filter((c) => c.pair === quiz.pair).map((c) => c.text)
      expect(refs).toHaveLength(2)
      expect(refs[0]).toBe(refs[1])
      expect(quiz.options[quiz.answer]).toBe(textByRef.get(refs[0]))
      expect(new Set(quiz.options).size).toBe(4)
    }
  })

  it('scores a finished game and reveals once everyone has finished', async () => {
    const { room, players } = await memSetup()
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    broadcasts.length = 0
    // Ann: perfect, 20s. 6 pairs of 80s => base 1000 * (1 - 0.5*20/80) = 875
    const ann = await answer(sid, players[0], q, JSON.stringify(playLog(q.content)), 20_000)
    expect(ann.body).toEqual({ points: 875, is_correct: true })
    expect(events('question_reveal').length).toBe(0)
    // Bob: 1 mistake, all found, only 3 answered (all right), 30s => base 750 * 0.8125 = 609 - 20 = 589
    const bob = await answer(sid, players[1], q, JSON.stringify(playLog(q.content, { mistakes: 1, answered: 3 })), 30_000)
    expect(bob.body).toEqual({ points: 589, is_correct: true })
    const reveal = events('question_reveal')
    expect(reveal).toHaveLength(1)
    expect(reveal[0].payload.correct_answer).toEqual(q.content.quiz.map((x) => x.answer))
    expect(reveal[0].payload.standings.entries.map((e) => [e.name, e.points])).toEqual([['Ann', 875], ['Bob', 589]])
  })

  it('scores a partial result when time ran out', async () => {
    const { room, players } = await memSetup({}, ['Ann'])
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    const log = playLog(q.content)
    const partial = { f: log.f.slice(0, 6), q: log.q.slice(0, 3) } // 3 pairs found and answered
    const r = await answer(sid, players[0], q, JSON.stringify(partial), 80_000)
    expect(r.body).toEqual({ points: 250, is_correct: false }) // base 500*(3/6)+500*(3/6)=500 * 0.5 factor
  })

  it('raises an impossibly fast claimed time to the plausible minimum', async () => {
    const { room, players } = await memSetup({}, ['Ann'])
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    // 6 moves + 6 answers => 9000ms floor: 1000 * (1 - 0.5*9000/80000) = 944
    const r = await answer(sid, players[0], q, JSON.stringify(playLog(q.content)), 1)
    expect(r.body.points).toBe(944)
  })

  it('rejects invalid results with 400 and records nothing', async () => {
    const { room, players } = await memSetup({}, ['Ann'])
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    const log = playLog(q.content)
    const bad = [
      'not json',
      JSON.stringify({ f: [0, 99], q: [] }),
      JSON.stringify({ f: [0, 0], q: [] }),
      JSON.stringify({ f: [], q: [[0, 1]] }),
      JSON.stringify({ f: log.f, q: [log.q[0], log.q[0]] }),
      JSON.stringify({ f: log.f, q: [[0, 7]] }),
      JSON.stringify({ f: 'x', q: [] }),
      JSON.stringify([1, 2, 3]),
    ]
    for (const submitted of bad) expect((await answer(sid, players[0], q, submitted)).status).toBe(400)
    expect((await sql`select count(*)::int n from answers where session_id = ${sid}`)[0].n).toBe(0)
  })

  it('allows long memory results but still limits other games to 500 characters', async () => {
    const { room, players } = await memSetup({}, ['Ann'])
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    expect((await answer(sid, players[0], q, 'x'.repeat(2001))).status).toBe(400) // over the absolute cap
    const padded = JSON.stringify({ f: [], q: [], pad: 'y'.repeat(900) }) // 900+ chars: fine for memory
    expect((await answer(sid, players[0], q, padded)).status).toBe(200)
    const other = await setup({ names: ['Zed'] })
    const sid2 = await start(other.room); await next(sid2, other.room)
    expect((await answer(sid2, other.players[0], await currentQ(sid2), '0'.repeat(501))).status).toBe(400)
  })

  it('host-state carries the board and the per-pair answers after the reveal', async () => {
    const { room, players } = await memSetup({}, ['Ann'])
    const sid = await start(room); await next(sid, room)
    const q = await currentQ(sid)
    const before = await call('rooms', 'GET', `/${room.code}/host-state`, { headers: room.host })
    expect(before.body.currentQuestion.content.cards).toHaveLength(12)
    expect(before.body.correctAnswer).toBeNull()
    await answer(sid, players[0], q, JSON.stringify(playLog(q.content)), 20_000)
    const after = await call('rooms', 'GET', `/${room.code}/host-state`, { headers: room.host })
    expect(after.body.correctAnswer).toEqual(q.content.quiz.map((x) => x.answer))
  })

  it('cleanup_old_rooms removes only old stored boards', async () => {
    await sql`insert into questions (game_type, order_index, content, created_at) values ('memory_match', 0, '{}', now() - interval '10 days')`
    await sql`select cleanup_old_rooms()`
    const [{ n }] = await sql`select count(*)::int n from questions where game_type = 'memory_match' and created_at < now() - interval '7 days'`
    expect(n).toBe(0)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `bash e2e/reset-db.sh && npm run test:e2e`
Expected: the new `memory match (server)` tests FAIL (e.g. `invalid game_type` / 500 / missing columns in the Drizzle schema); the 45 existing tests still pass.

- [ ] **Step 4: Update the Drizzle schema** — `supabase/functions/_shared/schema.ts`

Change the enum:
```ts
export const gameTypeEnum = pgEnum('game_type', ['bible_quiz', 'verse_scramble', 'emoji_story', 'memory_match'])
```
In `rooms` (after `questionCount`):
```ts
  memoryCards: integer('memory_cards').notNull().default(20),
  memoryDelayMs: integer('memory_delay_ms').notNull().default(1000),
```
In `questions` (after `content`):
```ts
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 5: Update `POST /rooms`** — `supabase/functions/rooms/index.ts`

Add to the imports from `'../_shared/game.ts'` nothing new; add a new import line:
```ts
import { MEMORY_DEFAULT_CARDS, MEMORY_DEFAULT_DELAY_MS, isMemoryCardCount, isMemoryDelay } from '../_shared/memory.ts'
```
Replace the create-room validation/insert block (from `const body = await req.json()...` in the `POST /rooms` branch through the `.values({ code, gameType: game_type, ... })` insert) so it reads:
```ts
      const body = await req.json().catch(() => null)
      const {
        game_type, mode = 'individual', question_count = 10,
        memory_cards = MEMORY_DEFAULT_CARDS, memory_delay_ms = MEMORY_DEFAULT_DELAY_MS,
      } = body ?? {}
      if (!GAME_TYPES.includes(game_type)) return json({ error: 'invalid game_type' }, 400)
      if (!(ROOM_MODES as readonly string[]).includes(mode)) return json({ error: 'invalid mode' }, 400)
      if (!Number.isInteger(question_count) || question_count < 1 || question_count > MAX_QUESTION_COUNT) {
        return json({ error: 'invalid question_count' }, 400)
      }
      const isMemory = game_type === 'memory_match'
      if (isMemory && !isMemoryCardCount(memory_cards)) return json({ error: 'invalid memory_cards' }, 400)
      if (isMemory && !isMemoryDelay(memory_delay_ms)) return json({ error: 'invalid memory_delay_ms' }, 400)
```
and the insert:
```ts
      const [room] = await db.insert(rooms).values({
        code,
        gameType: game_type,
        mode,
        // A memory game is exactly one board, whatever question count the client sent.
        questionCount: isMemory ? 1 : question_count,
        memoryCards: isMemory ? memory_cards : MEMORY_DEFAULT_CARDS,
        memoryDelayMs: isMemory ? memory_delay_ms : MEMORY_DEFAULT_DELAY_MS,
        hostToken,
      }).returning()
```
(Keep the room-code generation loop between validation and insert unchanged.)

- [ ] **Step 6: Update `sessions/index.ts`**

Imports — change the `game.ts` import and add the memory import:
```ts
import {
  TIMER_MS, effectiveTimeMs, isPastDeadline, scoreAnswer, publicContent, shuffle,
  timerMsOf, maxAnswerLength, MAX_MEMORY_ANSWER_LENGTH,
} from '../_shared/game.ts'
import { buildBoard, scoreMemoryAnswer, type MemoryVerse } from '../_shared/memory.ts'
```
(If `TIMER_MS` is no longer used after step below, drop it from the import to keep lint clean.)

In `POST /sessions/:id/next`, replace the `if (isFirstCall) { ... }` block with:
```ts
      if (isFirstCall) {
        if (row.room.gameType === 'memory_match') {
          // One board per game, built from the Verse Scramble verses and stored as a questions row so
          // answers.question_id keeps its foreign key.
          const verseRows = await db
            .select({ content: questions.content })
            .from(questions)
            .where(eq(questions.gameType, 'verse_scramble'))
          const verses: MemoryVerse[] = verseRows.map(({ content }) => {
            const c = content as { reference: string; words: string[]; correct_order: number[] }
            return { reference: c.reference, text: c.correct_order.map((i) => c.words[i]).join(' ') }
          })
          const board = buildBoard(verses, row.room.memoryCards, row.room.memoryDelayMs)
          const [boardRow] = await db.insert(questions)
            .values({ gameType: 'memory_match', orderIndex: 0, content: board })
            .returning({ id: questions.id })
          cachedQs = [{ id: boardRow.id, gameType: 'memory_match', content: board }]
        } else {
          const pool = await db
            .select({ id: questions.id, gameType: questions.gameType, content: questions.content })
            .from(questions)
            .where(eq(questions.gameType, row.room.gameType))
          cachedQs = shuffle(pool).slice(0, row.room.questionCount)
        }
      }
```
In `POST /sessions/:id/answer`:
- change the early length check `submitted_answer.length > 500` to `submitted_answer.length > MAX_MEMORY_ANSWER_LENGTH`;
- after `current` is resolved and the `status !== 'question'` early return, add:
```ts
      if (submitted_answer.length > maxAnswerLength(current.gameType)) return json({ error: 'missing required fields' }, 400)
```
- replace `const timerMs = TIMER_MS[current.gameType]` with `const timerMs = timerMsOf(current.gameType, current.content)`;
- replace the `const scored = scoreAnswer(...)` line with:
```ts
      const scored = current.gameType === 'memory_match'
        ? scoreMemoryAnswer(current.content, submitted_answer, timeMs)
        : scoreAnswer(current.gameType, current.content, submitted_answer, timeMs)
```

- [ ] **Step 7: Update the client `GameType` so the app still type-checks** — `types/game.ts`

```ts
export type GameType = 'bible_quiz' | 'verse_scramble' | 'emoji_story' | 'memory_match'
```
and add at the bottom of the file:
```ts
export type { MemoryCard, MemoryQuiz, MemoryBoard, MemoryResult } from '@/lib/memory-rules'
export type { MemoryBoard as MemoryMatchContent } from '@/lib/memory-rules'
```

- [ ] **Step 8: Run the server tests and the checks**

```bash
bash e2e/reset-db.sh
npm run test:e2e
```
Expected: `Tests  56 passed (56)` (45 existing + 11 new). If a points assertion differs by 1, recompute with `Math.round` on the exact base and adjust the expected value in the test (the formula, not the code, is the source of truth).

```bash
S=/private/tmp/claude-501/-Users-robertokreshna-CG-Tools/1566a0e8-650b-4871-8226-5d0a20f257f5/scratchpad
npx tsc -p $S/tsconfig.fn.json && echo "edge tsc ok"
```
Expected: `edge tsc ok`. (`tsc --noEmit` for the app may still list `GAME_OPTIONS` / switch errors: fixed in Tasks 8–9.)

- [ ] **Step 9: Checkpoint**

Suggested commit: `feat(functions): create, store, validate and score memory match boards`

---

## Task 6: Client board reducer — tests first

**Files:**
- Create: `lib/memory-board.ts`
- Test: `__tests__/memory-board.test.ts`

- [ ] **Step 1: Write the failing tests**

`__tests__/memory-board.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { makeBoardReducer, initialBoardState, isBoardFinished, toResult, quizFor, type BoardState } from '@/lib/memory-board'
import type { MemoryBoard } from '@/lib/memory-rules'

// 4 cards: ids 0,2 are pair 0; ids 1,3 are pair 1.
const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 30_000,
  cards: [
    { id: 0, pair: 0, text: 'A 1:1' }, { id: 1, pair: 1, text: 'B 2:2' },
    { id: 2, pair: 0, text: 'A 1:1' }, { id: 3, pair: 1, text: 'B 2:2' },
  ],
  quiz: [
    { pair: 0, options: ['w', 'x', 'y', 'z'], answer: 2 },
    { pair: 1, options: ['w', 'x', 'y', 'z'], answer: 0 },
  ],
}
const reduce = makeBoardReducer(board)
const run = (actions: Parameters<typeof reduce>[1][], from: BoardState = initialBoardState) => actions.reduce(reduce, from)

describe('flipping cards', () => {
  it('the first flip opens one card', () => {
    const s = run([{ type: 'flip', id: 0 }])
    expect(s.flipped).toEqual([0])
    expect(s.flips).toEqual([0])
    expect(s.locked).toBe(false)
  })

  it('two matching cards stay matched and open the quiz for that pair', () => {
    const s = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])
    expect(s.matched).toEqual([0])
    expect(s.flipped).toEqual([])
    expect(s.quizPair).toBe(0)
    expect(s.mistakes).toBe(0)
    expect(s.flips).toEqual([0, 2])
  })

  it('two different cards lock the board and count a mistake', () => {
    const s = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 1 }])
    expect(s.flipped).toEqual([0, 1])
    expect(s.locked).toBe(true)
    expect(s.mistakes).toBe(1)
    expect(s.matched).toEqual([])
  })

  it('ignores taps while locked, and closes the mismatch on hideMismatch', () => {
    const locked = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 1 }])
    expect(reduce(locked, { type: 'flip', id: 2 })).toBe(locked)
    const closed = reduce(locked, { type: 'hideMismatch' })
    expect(closed.flipped).toEqual([])
    expect(closed.locked).toBe(false)
    expect(closed.flips).toEqual([0, 1]) // the log keeps the failed move
  })

  it('hideMismatch does nothing when not locked', () => {
    const s = run([{ type: 'flip', id: 0 }])
    expect(reduce(s, { type: 'hideMismatch' })).toBe(s)
  })

  it('ignores the same card twice, a matched card, and an unknown card', () => {
    const one = run([{ type: 'flip', id: 0 }])
    expect(reduce(one, { type: 'flip', id: 0 })).toBe(one)
    const matched = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }, { type: 'answer', option: 2 }, { type: 'closeQuiz' }])
    expect(reduce(matched, { type: 'flip', id: 0 })).toBe(matched)
    expect(reduce(matched, { type: 'flip', id: 2 })).toBe(matched)
    expect(reduce(initialBoardState, { type: 'flip', id: 99 })).toBe(initialBoardState)
  })

  it('ignores taps while the quiz is open', () => {
    const quiz = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])
    expect(reduce(quiz, { type: 'flip', id: 1 })).toBe(quiz)
  })
})

describe('the multiple choice', () => {
  const asked = run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }])

  it('records the chosen option once and ignores a second choice', () => {
    const answered = reduce(asked, { type: 'answer', option: 2 })
    expect(answered.chosen).toBe(2)
    expect(answered.answers).toEqual([[0, 2]])
    expect(reduce(answered, { type: 'answer', option: 1 })).toBe(answered)
  })

  it('ignores an answer when no quiz is open, or an option out of range', () => {
    expect(reduce(initialBoardState, { type: 'answer', option: 0 })).toBe(initialBoardState)
    expect(reduce(asked, { type: 'answer', option: 4 })).toBe(asked)
    expect(reduce(asked, { type: 'answer', option: -1 })).toBe(asked)
  })

  it('cannot be closed before an answer is chosen', () => {
    expect(reduce(asked, { type: 'closeQuiz' })).toBe(asked)
  })

  it('closing after an answer frees the board', () => {
    const closed = run([{ type: 'answer', option: 1 }, { type: 'closeQuiz' }], asked)
    expect(closed.quizPair).toBeNull()
    expect(closed.chosen).toBeNull()
    expect(closed.answers).toEqual([[0, 1]])
  })
})

describe('finishing and submitting', () => {
  const finished = run([
    { type: 'flip', id: 0 }, { type: 'flip', id: 1 }, { type: 'hideMismatch' },
    { type: 'flip', id: 0 }, { type: 'flip', id: 2 }, { type: 'answer', option: 2 }, { type: 'closeQuiz' },
    { type: 'flip', id: 1 }, { type: 'flip', id: 3 }, { type: 'answer', option: 3 },
  ])

  it('is finished only when every pair is matched and answered', () => {
    expect(isBoardFinished(board, initialBoardState)).toBe(false)
    expect(isBoardFinished(board, run([{ type: 'flip', id: 0 }, { type: 'flip', id: 2 }]))).toBe(false) // matched, not answered
    expect(isBoardFinished(board, finished)).toBe(true)
  })

  it('turns the state into the log the server replays', () => {
    expect(toResult(finished)).toEqual({ f: [0, 1, 0, 2, 1, 3], q: [[0, 2], [1, 3]] })
  })

  it('finds the quiz for a pair', () => {
    expect(quizFor(board, 1)?.answer).toBe(0)
    expect(quizFor(board, 9)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/memory-board.test.ts`
Expected: FAIL — cannot resolve `@/lib/memory-board`.

- [ ] **Step 3: Implement `lib/memory-board.ts`**

```ts
import type { MemoryBoard, MemoryQuiz, MemoryResult } from '@/lib/memory-rules'

/** Everything the board needs to render and to submit. Pure data; timers live in the component. */
export interface BoardState {
  /** Card ids currently face up and not yet resolved (0 to 2). */
  flipped: number[]
  /** Pair ids already found. */
  matched: number[]
  /** The pair whose multiple choice is open, if any. */
  quizPair: number | null
  /** The option picked in the open quiz; set means "showing feedback". */
  chosen: number | null
  /** [pair, option] for every answered quiz, in order. */
  answers: [number, number][]
  /** Every flip in order (two per move): what the server replays. */
  flips: number[]
  mistakes: number
  /** Two different cards are face up, waiting to be closed. */
  locked: boolean
}

export type BoardAction =
  | { type: 'flip'; id: number }
  | { type: 'hideMismatch' }
  | { type: 'answer'; option: number }
  | { type: 'closeQuiz' }

export const initialBoardState: BoardState = {
  flipped: [], matched: [], quizPair: null, chosen: null, answers: [], flips: [], mistakes: 0, locked: false,
}

export function quizFor(board: MemoryBoard, pair: number): MemoryQuiz | undefined {
  return board.quiz.find((q) => q.pair === pair)
}

/** The reducer for one board. Invalid actions return the same state object (so they cause no re-render). */
export function makeBoardReducer(board: MemoryBoard) {
  return (state: BoardState, action: BoardAction): BoardState => {
    switch (action.type) {
      case 'flip': {
        const card = board.cards[action.id]
        if (!card || state.locked || state.quizPair !== null) return state
        if (state.matched.includes(card.pair) || state.flipped.includes(action.id)) return state
        const flips = [...state.flips, action.id]
        if (state.flipped.length === 0) return { ...state, flipped: [action.id], flips }
        const first = board.cards[state.flipped[0]]
        if (first.pair === card.pair) {
          return { ...state, flipped: [], matched: [...state.matched, card.pair], quizPair: card.pair, flips }
        }
        return { ...state, flipped: [state.flipped[0], action.id], mistakes: state.mistakes + 1, locked: true, flips }
      }
      case 'hideMismatch':
        return state.locked ? { ...state, flipped: [], locked: false } : state
      case 'answer': {
        if (state.quizPair === null || state.chosen !== null) return state
        const quiz = quizFor(board, state.quizPair)
        if (!quiz || !Number.isInteger(action.option) || action.option < 0 || action.option >= quiz.options.length) return state
        return { ...state, chosen: action.option, answers: [...state.answers, [state.quizPair, action.option]] }
      }
      case 'closeQuiz':
        return state.chosen === null ? state : { ...state, quizPair: null, chosen: null }
    }
  }
}

/** Every pair found and every quiz answered. */
export function isBoardFinished(board: MemoryBoard, state: BoardState): boolean {
  return state.matched.length === board.quiz.length && state.answers.length === board.quiz.length
}

export function toResult(state: BoardState): MemoryResult {
  return { f: state.flips, q: state.answers }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run __tests__/memory-board.test.ts && npx tsc --noEmit`
Expected: tests pass; `tsc` clean except for any errors still listed for Tasks 8–9.

- [ ] **Step 5: Checkpoint**

Suggested commit: `feat: memory board reducer`

---

## Task 7: Quiz sheet and board components — tests first

**Files:**
- Create: `components/games/MemoryQuizSheet.tsx`, `components/games/MemoryMatch.tsx`
- Test: `__tests__/memory-quiz-sheet.test.tsx`, `__tests__/memory-match.test.tsx`

- [ ] **Step 1: Write the failing test for the quiz sheet**

`__tests__/memory-quiz-sheet.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryQuizSheet } from '@/components/games/MemoryQuizSheet'

const base = {
  reference: 'Yohanes 3:16',
  options: ['Karena begitu besar kasih Allah', 'TUHAN adalah gembalaku', 'Pada mulanya Allah', 'Akulah jalan'],
  answer: 0,
  onChoose: vi.fn(),
  onContinue: vi.fn(),
}

describe('MemoryQuizSheet', () => {
  it('is a modal dialog titled with the reference, listing the four options', () => {
    render(<MemoryQuizSheet {...base} chosen={null} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText(/Yohanes 3:16/)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('focuses the first option so the keyboard works immediately', () => {
    render(<MemoryQuizSheet {...base} chosen={null} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Karena begitu besar kasih Allah/ }))
  })

  it('reports the option that was tapped', () => {
    const onChoose = vi.fn()
    render(<MemoryQuizSheet {...base} onChoose={onChoose} chosen={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Akulah jalan/ }))
    expect(onChoose).toHaveBeenCalledWith(3)
  })

  it('after a right answer shows "Benar!" and a continue button; options are disabled', () => {
    const onContinue = vi.fn()
    render(<MemoryQuizSheet {...base} onContinue={onContinue} chosen={0} />)
    expect(screen.getByRole('status').textContent).toContain('Benar!')
    for (const option of screen.getAllByRole('button').slice(0, 4)) expect((option as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('after a wrong answer says so and marks the right option', () => {
    render(<MemoryQuizSheet {...base} chosen={2} />)
    expect(screen.getByRole('status').textContent).toContain('Salah')
    expect(screen.getByRole('button', { name: /Karena begitu besar kasih Allah/ }).textContent).toContain('✓')
    expect(screen.getByRole('button', { name: /Pada mulanya Allah/ }).textContent).toContain('✗')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/memory-quiz-sheet.test.tsx`
Expected: FAIL — cannot resolve `@/components/games/MemoryQuizSheet`.

- [ ] **Step 3: Implement `components/games/MemoryQuizSheet.tsx`**

```tsx
'use client'
import { useEffect, useRef } from 'react'

interface MemoryQuizSheetProps {
  reference: string
  options: string[]
  answer: number
  /** The option the player picked; null while still choosing. */
  chosen: number | null
  onChoose: (option: number) => void
  onContinue: () => void
}

/** The multiple choice shown after a pair is found: "what does this verse say?" */
export function MemoryQuizSheet({ reference, options, answer, chosen, onChoose, onContinue }: MemoryQuizSheetProps) {
  const firstRef = useRef<HTMLButtonElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])
  useEffect(() => {
    if (chosen !== null) continueRef.current?.focus()
  }, [chosen])

  const right = chosen !== null && chosen === answer

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-quiz-title"
        className="card w-full max-w-md p-4 flex flex-col gap-3 animate-pop-in max-h-[85dvh] overflow-y-auto"
      >
        <h2 id="memory-quiz-title" className="font-display text-lg font-semibold">
          {reference} <span className="text-mist font-medium">— Apa bunyinya?</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {options.map((text, i) => {
            const isAnswer = chosen !== null && i === answer
            const isWrong = chosen !== null && i === chosen && i !== answer
            return (
              <li key={i}>
                <button
                  ref={i === 0 ? firstRef : undefined}
                  onClick={() => onChoose(i)}
                  disabled={chosen !== null}
                  className={`w-full text-left rounded-xl border px-3 py-3 text-sm font-semibold leading-snug transition-colors disabled:cursor-default ${
                    isAnswer ? 'bg-emerald-400/15 border-emerald-400/60 text-emerald-200'
                    : isWrong ? 'bg-rose-400/15 border-rose-400/60 text-rose-200'
                    : 'bg-white/5 border-line text-white'
                  } ${chosen !== null && !isAnswer && !isWrong ? 'opacity-50' : ''}`}
                >
                  {text}
                  {isAnswer && <span aria-hidden> ✓</span>}
                  {isWrong && <span aria-hidden> ✗</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {chosen !== null && (
          <div role="status" className="flex items-center justify-between gap-3">
            <p className={`text-sm font-bold ${right ? 'text-emerald-300' : 'text-rose-300'}`}>
              {right ? 'Benar!' : 'Salah — jawaban yang benar ditandai hijau.'}
            </p>
            <button ref={continueRef} onClick={onContinue} className="btn-primary py-2 px-5 text-sm shrink-0">
              Lanjut
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify the sheet tests pass**

Run: `npx vitest run __tests__/memory-quiz-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the board component**

`__tests__/memory-match.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const submitAnswer = vi.fn()
vi.mock('@/lib/api', () => ({ submitAnswer: (...args: unknown[]) => submitAnswer(...args) }))

import { MemoryMatch } from '@/components/games/MemoryMatch'
import type { MemoryBoard } from '@/lib/memory-rules'

// 4 cards: pair 0 = ids 0 and 2, pair 1 = ids 1 and 3.
const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 60_000,
  cards: [
    { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
    { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
  ],
  quiz: [
    { pair: 0, options: ['ayat Yohanes', 'b', 'c', 'd'], answer: 0 },
    { pair: 1, options: ['a', 'ayat Mazmur', 'c', 'd'], answer: 1 },
  ],
}

function renderBoard(onAnswered = vi.fn()) {
  render(
    <MemoryMatch
      questionId="q1" content={board} sessionId="s1" sessionToken="t1"
      questionIndex={0} totalQuestions={1} onAnswered={onAnswered}
    />,
  )
  return onAnswered
}
const card = (id: number) => screen.getByRole('button', { name: new RegExp(`^Kartu ${id + 1},`) })
const tap = (id: number) => fireEvent.click(card(id))
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }

describe('MemoryMatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    submitAnswer.mockReset()
    submitAnswer.mockResolvedValue({ points: 700, is_correct: true })
  })
  afterEach(() => { vi.useRealTimers() })

  it('shows every card face down with an accessible label and the pair counter', () => {
    renderBoard()
    expect(screen.getAllByRole('button', { name: /tertutup/ })).toHaveLength(4)
    expect(screen.getByText(/0\s*\/\s*2 pasang/)).toBeTruthy()
  })

  it('opens a tapped card and labels it with its reference', () => {
    renderBoard()
    tap(0)
    expect(card(0).getAttribute('aria-label')).toContain('terbuka: Yohanes 3:16')
  })

  it('closes a mismatch after exactly hideMs and ignores taps in between', () => {
    renderBoard()
    tap(0); tap(1)
    expect(screen.getByText(/1 salah/)).toBeTruthy()
    tap(2) // locked
    expect(card(2).getAttribute('aria-label')).toContain('tertutup')
    act(() => { vi.advanceTimersByTime(999) })
    expect(card(0).getAttribute('aria-label')).toContain('terbuka')
    act(() => { vi.advanceTimersByTime(1) })
    expect(card(0).getAttribute('aria-label')).toContain('tertutup')
    expect(card(1).getAttribute('aria-label')).toContain('tertutup')
  })

  it('opens the multiple choice when a pair matches, and gives feedback then closes by itself', () => {
    renderBoard()
    tap(0); tap(2)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Yohanes 3:16/, { selector: 'h2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    expect(screen.getByRole('status').textContent).toContain('Benar!')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/1\s*\/\s*2 pasang/)).toBeTruthy()
  })

  it('lets the player continue early with the Lanjut button', () => {
    renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('submits the log as soon as the last pair is answered', async () => {
    const onAnswered = renderBoard()
    tap(0); tap(1)
    act(() => { vi.advanceTimersByTime(1000) })
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    expect(submitAnswer).toHaveBeenCalledTimes(1)
    const [sessionId, token, payload] = submitAnswer.mock.calls[0]
    expect(sessionId).toBe('s1')
    expect(token).toBe('t1')
    expect(payload.question_id).toBe('q1')
    expect(JSON.parse(payload.submitted_answer)).toEqual({ f: [0, 1, 0, 2, 1, 3], q: [[0, 0], [1, 1]] })
    expect(typeof payload.time_taken_ms).toBe('number')
    expect(onAnswered).toHaveBeenCalledWith(700, payload.submitted_answer)
  })

  it('submits what it has when the timer runs out', async () => {
    const onAnswered = renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_500) })
    expect(submitAnswer).toHaveBeenCalledTimes(1)
    const payload = submitAnswer.mock.calls[0][2]
    expect(JSON.parse(payload.submitted_answer)).toEqual({ f: [0, 2], q: [[0, 0]] })
    expect(payload.time_taken_ms).toBe(60_000)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  it('shows a retry when the final submit fails, and succeeds on the second try', async () => {
    submitAnswer.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ points: 500, is_correct: true })
    const onAnswered = renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('belum terkirim')
    expect(onAnswered).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Kirim ulang/ }))
    await flush()
    expect(submitAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswered).toHaveBeenCalledWith(500, expect.any(String))
  })

  it('does not submit twice for the same board', async () => {
    renderBoard()
    tap(0); tap(2)
    fireEvent.click(screen.getByRole('button', { name: /ayat Yohanes/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    tap(1); tap(3)
    fireEvent.click(screen.getByRole('button', { name: /ayat Mazmur/ }))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000) }) // timer expires after finishing
    expect(submitAnswer).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run __tests__/memory-match.test.tsx`
Expected: FAIL — cannot resolve `@/components/games/MemoryMatch`.

- [ ] **Step 7: Implement `components/games/MemoryMatch.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Timer } from '@/components/shared/Timer'
import { MemoryQuizSheet } from '@/components/games/MemoryQuizSheet'
import { submitAnswer } from '@/lib/api'
import { now } from '@/lib/clock'
import { initialBoardState, isBoardFinished, makeBoardReducer, quizFor, toResult } from '@/lib/memory-board'
import type { MemoryBoard } from '@/lib/memory-rules'

interface Props {
  questionId: string
  content: MemoryBoard
  sessionId: string
  sessionToken: string
  questionIndex: number
  totalQuestions: number
  /** Time already used when this question was loaded (refresh mid-question). */
  elapsedMs?: number
  onAnswered: (points: number, submittedAnswer: string) => void
}

/** How long the right/wrong feedback stays before the quiz closes by itself. */
const FEEDBACK_MS = 2000

const TEXT_BY_COLS: Record<number, string> = { 3: 'text-base', 4: 'text-sm', 5: 'text-[11px]' }

export function MemoryMatch({ questionId, content, sessionId, sessionToken, elapsedMs = 0, onAnswered }: Props) {
  const reducer = useMemo(() => makeBoardReducer(content), [content])
  const [state, dispatch] = useReducer(reducer, initialBoardState)
  const [sendError, setSendError] = useState(false)
  const [expired, setExpired] = useState(false)
  const startRef = useRef(0)
  const stateRef = useRef(state)
  const sentRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  })
  useEffect(() => {
    startRef.current = now() - elapsedMs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Two different cards stay visible for hideMs, then close.
  useEffect(() => {
    if (!state.locked) return
    const id = setTimeout(() => dispatch({ type: 'hideMismatch' }), content.hideMs)
    return () => clearTimeout(id)
  }, [state.locked, content.hideMs])

  // After an answer, the feedback closes by itself unless the player taps Lanjut first.
  useEffect(() => {
    if (state.chosen === null) return
    const id = setTimeout(() => dispatch({ type: 'closeQuiz' }), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [state.chosen])

  const submit = useCallback(async (elapsed: number): Promise<boolean> => {
    const submitted = JSON.stringify(toResult(stateRef.current))
    try {
      const result = await submitAnswer(sessionId, sessionToken, {
        question_id: questionId, submitted_answer: submitted, time_taken_ms: elapsed,
      })
      onAnswered(result.points, submitted)
      return true
    } catch {
      return false
    }
  }, [sessionId, sessionToken, questionId, onAnswered])

  const finished = isBoardFinished(content, state)

  // Everything found and answered: send straight away (the time counts from the last answer).
  useEffect(() => {
    if (!finished || sentRef.current) return
    sentRef.current = true
    void (async () => {
      if (!(await submit(now() - startRef.current))) setSendError(true)
    })()
  }, [finished, submit])

  const retry = () => {
    setSendError(false)
    void (async () => {
      if (!(await submit(now() - startRef.current))) setSendError(true)
    })()
  }

  const handleExpire = useCallback(async () => {
    if (sentRef.current) return
    sentRef.current = true
    setExpired(true)
    // Time is up: send what there is; if even that fails there is no second chance.
    if (!(await submit(content.timerMs))) onAnswered(0, JSON.stringify(toResult(stateRef.current)))
  }, [submit, content.timerMs, onAnswered])

  const over = finished || expired
  const pairs = content.quiz.length
  const open = (id: number) => state.flipped.includes(id)
  const found = (pair: number) => state.matched.includes(pair)
  const activeQuiz = state.quizPair !== null ? quizFor(content, state.quizPair) : undefined
  const activeReference = state.quizPair !== null ? content.cards.find((c) => c.pair === state.quizPair)?.text ?? '' : ''
  const textSize = TEXT_BY_COLS[content.cols] ?? 'text-sm'

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto w-full flex-1 pt-2">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-night/90 backdrop-blur flex items-center justify-between">
        <p className="tag tabular-nums">
          {state.matched.length} / {pairs} pasang · {state.mistakes} salah
        </p>
        <Timer compact durationMs={Math.max(500, content.timerMs - elapsedMs)} onExpire={handleExpire} />
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${content.cols}, minmax(0, 1fr))` }}>
        {content.cards.map((card) => {
          const matched = found(card.pair)
          const faceUp = matched || open(card.id)
          return (
            <button
              key={card.id}
              onClick={() => dispatch({ type: 'flip', id: card.id })}
              disabled={faceUp || state.locked || state.quizPair !== null || over}
              aria-label={faceUp ? `Kartu ${card.id + 1}, terbuka: ${card.text}` : `Kartu ${card.id + 1}, tertutup`}
              className={`aspect-square rounded-xl border-2 p-1 flex items-center justify-center text-center font-bold leading-tight break-words transition-colors ${textSize} ${
                matched ? 'bg-accent/20 border-accent text-white'
                : faceUp ? 'bg-raised border-white/40 text-white'
                : 'bg-surface border-line text-faint cursor-pointer active:scale-95'
              }`}
            >
              {faceUp ? <span className="animate-pop-in">{card.text}</span> : <span aria-hidden>?</span>}
            </button>
          )
        })}
      </div>

      {sendError && (
        <div role="alert" className="flex flex-col items-center gap-2">
          <p className="text-rose-300 text-xs font-semibold text-center">Jawaban belum terkirim. Periksa koneksi, lalu coba lagi.</p>
          <button onClick={retry} className="btn-primary py-2.5 px-6 text-sm">Kirim ulang</button>
        </div>
      )}

      {activeQuiz && (
        <MemoryQuizSheet
          reference={activeReference}
          options={activeQuiz.options}
          answer={activeQuiz.answer}
          chosen={state.chosen}
          onChoose={(option) => dispatch({ type: 'answer', option })}
          onContinue={() => dispatch({ type: 'closeQuiz' })}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run the component tests and the whole unit suite**

Run: `npx vitest run __tests__/memory-match.test.tsx __tests__/memory-quiz-sheet.test.tsx && npm run test:run`
Expected: both new files pass; the full unit run passes. If the "retry" test fails because the dialog is still open when the alert should show, check that `MemoryQuizSheet` stays mounted until `closeQuiz`; the test taps Lanjut before the last pair, but after the **last** answer the sheet is still open — in that case `screen.getByRole('alert')` still finds the alert (it is outside the dialog). If the `getByRole('button', { name: /Kirim ulang/ })` lookup is blocked by `aria-modal`, use `{ hidden: true }` in that query.

- [ ] **Step 9: Lint and type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean (except errors still pending in Tasks 8–9: `GAME_OPTIONS`, the play-page switch).

- [ ] **Step 10: Checkpoint**

Suggested commit: `feat: memory board and quiz sheet components`

---

## Task 8: Play page integration and the recap

**Files:**
- Create: `components/shared/MemoryRecap.tsx`
- Modify: `lib/play-state.ts`, `lib/realtime.ts`, `app/play/[roomCode]/page.tsx`
- Test: `__tests__/memory-recap.test.tsx`

- [ ] **Step 1: Write the failing recap test**

`__tests__/memory-recap.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRecap, parseMemoryAnswers } from '@/components/shared/MemoryRecap'
import type { MemoryBoard } from '@/lib/memory-rules'

const board: MemoryBoard = {
  cols: 2, hideMs: 1000, timerMs: 60_000,
  cards: [
    { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
    { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
  ],
  quiz: [
    { pair: 0, options: ['Karena begitu besar kasih Allah', 'b', 'c', 'd'], answer: 0 },
    { pair: 1, options: ['a', 'TUHAN adalah gembalaku', 'c', 'd'], answer: 1 },
  ],
}

describe('parseMemoryAnswers', () => {
  it('reads [pair, option] entries from a submitted result', () => {
    expect([...parseMemoryAnswers(JSON.stringify({ f: [], q: [[0, 2], [1, 3]] }))]).toEqual([[0, 2], [1, 3]])
  })
  it('returns an empty map for anything unusable', () => {
    expect(parseMemoryAnswers(null).size).toBe(0)
    expect(parseMemoryAnswers('nope').size).toBe(0)
    expect(parseMemoryAnswers(JSON.stringify({ q: 'x' })).size).toBe(0)
    expect(parseMemoryAnswers(JSON.stringify({ q: [[0]] })).size).toBe(0)
  })
})

describe('MemoryRecap', () => {
  it('lists every verse with the correct text and a mark for the player', () => {
    render(<MemoryRecap board={board} submitted={JSON.stringify({ f: [], q: [[0, 0], [1, 3]] })} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Yohanes 3:16')).toBeTruthy()
    expect(within(items[0]).getByText('Karena begitu besar kasih Allah')).toBeTruthy()
    expect(within(items[0]).getByLabelText('benar')).toBeTruthy()
    expect(within(items[1]).getByLabelText('salah')).toBeTruthy()
    expect(within(items[1]).getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })

  it('marks verses that were never answered', () => {
    render(<MemoryRecap board={board} submitted={null} />)
    expect(screen.getAllByLabelText('belum dijawab')).toHaveLength(2)
  })

  it('without a submitted result (host view) shows the verses without marks', () => {
    render(<MemoryRecap board={board} submitted={undefined} />)
    expect(screen.queryByLabelText('benar')).toBeNull()
    expect(screen.queryByLabelText('belum dijawab')).toBeNull()
    expect(screen.getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/memory-recap.test.tsx`
Expected: FAIL — cannot resolve `@/components/shared/MemoryRecap`.

- [ ] **Step 3: Implement `components/shared/MemoryRecap.tsx`**

```tsx
import type { MemoryBoard } from '@/lib/memory-rules'

/** pair → chosen option, read defensively from the string a player submitted. */
export function parseMemoryAnswers(submitted: string | null | undefined): Map<number, number> {
  const answers = new Map<number, number>()
  if (!submitted) return answers
  try {
    const q = (JSON.parse(submitted) as { q?: unknown }).q
    if (!Array.isArray(q)) return answers
    for (const entry of q) {
      if (Array.isArray(entry) && entry.length === 2 && Number.isInteger(entry[0]) && Number.isInteger(entry[1])) {
        answers.set(entry[0], entry[1])
      }
    }
  } catch {
    // not JSON: nothing to show
  }
  return answers
}

interface MemoryRecapProps {
  board: MemoryBoard
  /** The player's own submitted result. `undefined` = no player (host view): list verses without marks. */
  submitted: string | null | undefined
}

/** Every verse on the board with its text and, for a player, whether they got it right. */
export function MemoryRecap({ board, submitted }: MemoryRecapProps) {
  const answers = parseMemoryAnswers(submitted)
  const showMarks = submitted !== undefined

  return (
    <section aria-label="Rekap ayat" className="w-full max-w-xs flex flex-col gap-1.5">
      <p className="tag">Rekap ayat</p>
      <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {board.quiz.map((quiz) => {
          const reference = board.cards.find((c) => c.pair === quiz.pair)?.text ?? ''
          const chosen = answers.get(quiz.pair)
          const mark = chosen === undefined ? 'belum dijawab' : chosen === quiz.answer ? 'benar' : 'salah'
          return (
            <li key={quiz.pair} className="rounded-xl bg-white/5 border border-line px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{reference}</span>
                {showMarks && (
                  <span
                    aria-label={mark}
                    className={mark === 'benar' ? 'text-emerald-300' : mark === 'salah' ? 'text-rose-300' : 'text-faint'}
                  >
                    {mark === 'benar' ? '✓' : mark === 'salah' ? '✗' : '–'}
                  </span>
                )}
              </div>
              <p className="text-mist text-xs font-semibold leading-snug mt-0.5">{quiz.options[quiz.answer]}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run to verify the recap tests pass**

Run: `npx vitest run __tests__/memory-recap.test.tsx`
Expected: PASS.

- [ ] **Step 5: Widen the content unions** — `lib/play-state.ts`

Add `MemoryBoard` to the imports:
```ts
import type { MemoryBoard } from '@/lib/memory-rules'
```
Then change both content unions from `BibleQuizContent | VerseScrambleContent | EmojiStoryContent` to `BibleQuizContent | VerseScrambleContent | EmojiStoryContent | MemoryBoard` (in `ActiveQuestion.content` and in `ServerState.current_question.content` — the latter is typed as `ActiveQuestion['content']`, so only `ActiveQuestion` needs the change). `lib/realtime.ts`: in the `question_show` event payload type, add `| MemoryBoard` to the `content` union and add `import type { MemoryBoard } from '@/lib/memory-rules'`.

- [ ] **Step 6: Render the game and the recap** — `app/play/[roomCode]/page.tsx`

Add imports:
```tsx
import { MemoryMatch } from '@/components/games/MemoryMatch'
import { MemoryRecap } from '@/components/shared/MemoryRecap'
import type { MemoryBoard } from '@/lib/memory-rules'
```
In the `phase === 'question'` block, after the `emoji_story` component, add:
```tsx
          {question.gameType === 'memory_match' && (
            <MemoryMatch
              key={question.questionId}
              questionId={question.questionId}
              content={question.content as MemoryBoard}
              sessionId={sessionId}
              sessionToken={session.sessionToken}
              questionIndex={question.questionIndex}
              totalQuestions={question.totalQuestions}
              elapsedMs={question.elapsedMs}
              onAnswered={handleAnswered}
            />
          )}
```
In the reveal IIFE (the one that returns the per-game answer review), add before the final `return null`:
```tsx
            if (question.gameType === 'memory_match') {
              return <MemoryRecap board={question.content as MemoryBoard} submitted={submittedAnswer} />
            }
```
(`correctAnswer` is an array for memory, so the existing `correctAnswer != null` guard is satisfied.)

- [ ] **Step 7: Type-check, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npm run test:run`
Expected: clean; all unit tests pass. Remaining `tsc` errors, if any, are only in `app/host/page.tsx` / `HostQuestionCard` (Task 9).

- [ ] **Step 8: Checkpoint**

Suggested commit: `feat: play memory match on the player screen, with a verse recap`

---

## Task 9: Host UI — configuration, question card, deadline

**Files:**
- Modify: `lib/api.ts`, `app/host/page.tsx`, `components/shared/HostQuestionCard.tsx`
- Test: `__tests__/host-question-card.test.tsx`

- [ ] **Step 1: Write the failing host-card test** — append to `__tests__/host-question-card.test.tsx`:

```tsx
const memory = {
  gameType: 'memory_match' as const,
  content: {
    cols: 3, hideMs: 1000, timerMs: 80_000,
    cards: [
      { id: 0, pair: 0, text: 'Yohanes 3:16' }, { id: 1, pair: 1, text: 'Mazmur 23:1' },
      { id: 2, pair: 0, text: 'Yohanes 3:16' }, { id: 3, pair: 1, text: 'Mazmur 23:1' },
    ],
    quiz: [
      { pair: 0, options: ['Karena begitu besar kasih Allah', 'b', 'c', 'd'], answer: 0 },
      { pair: 1, options: ['a', 'TUHAN adalah gembalaku', 'c', 'd'], answer: 1 },
    ],
  },
}

describe('HostQuestionCard: memory match', () => {
  it('summarises the board before the reveal without showing verses', () => {
    render(<HostQuestionCard question={memory} correctAnswer={null} revealed={false} />)
    expect(screen.getByText(/Memory Ayat/)).toBeTruthy()
    expect(screen.getByText(/2 pasang/)).toBeTruthy()
    expect(screen.getByText(/4 kartu/)).toBeTruthy()
    expect(screen.queryByText('TUHAN adalah gembalaku')).toBeNull()
  })

  it('lists every verse with its text after the reveal', () => {
    render(<HostQuestionCard question={memory} correctAnswer={[0, 1]} revealed />)
    expect(screen.getByText('Yohanes 3:16')).toBeTruthy()
    expect(screen.getByText('Karena begitu besar kasih Allah')).toBeTruthy()
    expect(screen.getByText('Mazmur 23:1')).toBeTruthy()
    expect(screen.getByText('TUHAN adalah gembalaku')).toBeTruthy()
  })

  it('tolerates a board with no data', () => {
    render(<HostQuestionCard question={{ gameType: 'memory_match', content: {} }} correctAnswer={null} revealed />)
    expect(screen.getByText(/Memory Ayat/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/host-question-card.test.tsx`
Expected: FAIL — the memory cases fall into the Emoji Story branch (no "Memory Ayat" text).

- [ ] **Step 3: Implement the memory branch** — `components/shared/HostQuestionCard.tsx`

Add this helper near the other helpers at the top of the file:
```tsx
const objects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []
```
and, just before the final Emoji Story fallthrough (`const words = strings(content.words)` after the verse_scramble block), insert:
```tsx
  if (gameType === 'memory_match') {
    const cards = objects(content.cards)
    const quiz = objects(content.quiz)
    return (
      <section className="card p-4 flex flex-col gap-2" aria-label="Soal saat ini">
        <p className="tag">Memory Ayat</p>
        <h2 className="font-display text-lg font-medium">
          {quiz.length} pasang <span className="text-mist text-sm font-semibold">· {cards.length} kartu</span>
        </h2>
        {!revealed && <p className="text-mist text-xs font-semibold">Pemain mencocokkan kartu, lalu menebak bunyi ayatnya.</p>}
        {revealed && (
          <ul className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {quiz.map((q, i) => {
              const options = strings(q.options)
              const reference = text(cards.find((c) => c.pair === q.pair)?.text)
              return (
                <li key={i} className="rounded-xl bg-white/5 border border-line px-3 py-2 text-sm">
                  <span className="font-bold">{reference}</span>
                  <p className="text-mist text-xs font-semibold leading-snug mt-0.5">{typeof q.answer === 'number' ? options[q.answer] : ''}</p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    )
  }
```

- [ ] **Step 4: Run to verify the host-card tests pass**

Run: `npx vitest run __tests__/host-question-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Send the memory config when creating a room** — `lib/api.ts`

Replace `createRoom` with:
```ts
export interface MemoryConfig {
  cards: number
  delayMs: number
}

export function createRoom(gameType: string, mode: string, questionCount: number, memory?: MemoryConfig) {
  return call('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      game_type: gameType,
      mode,
      question_count: questionCount,
      ...(memory ? { memory_cards: memory.cards, memory_delay_ms: memory.delayMs } : {}),
    }),
  })
}
```

- [ ] **Step 6: Update the host page** — `app/host/page.tsx`

(a) Imports: add `timerMsOf` to the existing `@/lib/scoring` import and add `MEMORY_CARD_COUNTS, MEMORY_DELAYS_MS, MEMORY_DEFAULT_CARDS, MEMORY_DEFAULT_DELAY_MS` from `@/lib/memory-rules`.
(b) Add the game to `GAME_OPTIONS`:
```tsx
  { type: 'memory_match', emoji: '🧩', label: 'Memory Ayat', desc: 'Cocokkan kartu · tebak ayat' },
```
(c) State (next to `questionCount`):
```tsx
  const [memoryCards, setMemoryCards] = useState<number>(MEMORY_DEFAULT_CARDS)
  const [memoryDelayMs, setMemoryDelayMs] = useState<number>(MEMORY_DEFAULT_DELAY_MS)
```
(d) `handleCreate`: change the call to
```tsx
      const data = await createRoom(
        gameType, mode, questionCount,
        gameType === 'memory_match' ? { cards: memoryCards, delayMs: memoryDelayMs } : undefined,
      )
```
(e) In the configure screen, replace the "Jumlah Soal" block's wrapper so it is hidden for memory, and add the two controls. Wrap the existing block:
```tsx
          {gameType !== 'memory_match' && (
            <div>
              <p className="tag mb-3">Jumlah Soal</p>
              {/* ...the existing segmented control, unchanged... */}
            </div>
          )}

          {gameType === 'memory_match' && (
            <>
              <div>
                <p className="tag mb-3">Jumlah Kartu</p>
                <div className="card p-1 flex gap-1">
                  {MEMORY_CARD_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setMemoryCards(n)}
                      aria-pressed={memoryCards === n}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${memoryCards === n ? 'bg-pick text-white' : 'text-mist'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="tag mb-3">Kartu Salah Tertutup Setelah</p>
                <div className="card p-1 flex gap-1">
                  {MEMORY_DELAYS_MS.map((ms) => (
                    <button
                      key={ms}
                      onClick={() => setMemoryDelayMs(ms)}
                      aria-pressed={memoryDelayMs === ms}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${memoryDelayMs === ms ? 'bg-pick text-white' : 'text-mist'}`}
                    >
                      {ms / 1000} dtk
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
```
(f) Auto-reveal deadline: replace `TIMER_MS[data.gameType]` in `applyHostState` with `timerMsOf(data.gameType, data.currentQuestion?.content)` and `TIMER_MS[gameType]` in the `question_show` branch of `handleEvent` with `timerMsOf(gameType, e.payload.content)`. If `TIMER_MS` is now unused in this file except for `GAME_OPTIONS` descriptions, keep the import.

- [ ] **Step 7: Run all checks**

Run: `npx tsc --noEmit && npm run lint && npm run test:run`
Expected: all clean/pass (this is the point where the whole app type-checks again).

- [ ] **Step 8: Checkpoint**

Suggested commit: `feat(host): create memory rooms with card count and delay; show the board and recap`

---

## Task 10: Visual verification (12/20/30/40 cards, two phone sizes)

**Files:**
- Create (scratch, not committed): `$S/pw/memory-visual.mjs`

- [ ] **Step 1: Build and start the app**

```bash
npx next build 2>&1 | grep -E "Compiled|rror"
(npx next start -p 3100 > "$S/next-start.log" 2>&1 &)
for i in $(seq 1 20); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
```
Expected: `✓ Compiled successfully`.

- [ ] **Step 2: Create the screenshot script**

`$S/pw/memory-visual.mjs` (builds real boards with the real rules module — Node strips the TypeScript types):
```js
import { chromium } from 'playwright'
import { buildBoard } from '/Users/robertokreshna/CG Tools/supabase/functions/_shared/memory.ts'

const S = process.argv[2]
const refs = ['Yohanes 3:16', 'Kisah Para Rasul 2:38', 'Mazmur 23:1', '1 Korintus 13:4', 'Filipi 4:13', 'Roma 8:28', 'Kejadian 1:1', 'Amsal 3:5',
  'Yesaya 41:10', 'Matius 28:19', 'Efesus 2:8', 'Ibrani 11:1', '1 Yohanes 4:8', 'Yosua 1:9', 'Mazmur 119:105', 'Lukas 2:11', 'Roma 12:2',
  'Galatia 5:22', 'Yeremia 29:11', 'Wahyu 3:20', 'Daniel 3:17', 'Rut 1:16', 'Ester 4:14', 'Yunus 2:9', 'Keluaran 20:3']
const verses = refs.map((reference, i) => ({ reference, text: `Ini bunyi ayat ${reference} yang cukup panjang untuk menguji tampilan pilihan ganda nomor ${i + 1}` }))
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
const json = (b) => ({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(b) })

const browser = await chromium.launch()
for (const count of [12, 20, 30, 40]) {
  const board = buildBoard(verses, count, 1000)
  for (const [w, h] of [[360, 640], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const p = await ctx.newPage()
    await p.addInitScript(() => localStorage.setItem('player:ZZTEST', JSON.stringify({ sessionToken: 't', playerId: 'p1' })))
    await p.route('**/functions/v1/rooms/ZZTEST/state', (r) => r.fulfill(json({
      phase: 'question', session_id: 's', elapsed_ms: 12000,
      current_question: { question_id: 'q1', game_type: 'memory_match', question_index: 0, total_questions: 1, content: board },
    })))
    await p.goto('http://localhost:3100/play/ZZTEST', { waitUntil: 'networkidle' })
    await p.waitForTimeout(700)
    // open one pair and the quiz, to see a matched card and the sheet
    const ids = board.cards.filter((c) => c.pair === 0).map((c) => c.id)
    for (const id of ids) await p.getByRole('button', { name: new RegExp(`^Kartu ${id + 1},`) }).click()
    await p.waitForTimeout(400)
    const dialog = await p.getByRole('dialog').isVisible()
    await p.screenshot({ path: `${S}/shots/mem-${count}-${w}-quiz.png` })
    // answer, wait for it to close, flip one wrong card to see an open card + counters
    await p.getByRole('dialog').getByRole('button').first().click()
    await p.getByRole('button', { name: 'Lanjut' }).click()
    const other = board.cards.filter((c) => c.pair === 1).map((c) => c.id)
    await p.getByRole('button', { name: new RegExp(`^Kartu ${other[0] + 1},`) }).click()
    await p.waitForTimeout(300)
    const overflow = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }))
    await p.screenshot({ path: `${S}/shots/mem-${count}-${w}-board.png` })
    console.log(`${String(count).padStart(2)} kartu @${w}x${h}: dialog=${dialog} geser-X=${overflow.sw > overflow.iw ? 'YA' : 'tidak'} tinggi=${overflow.sh}px`)
    await ctx.close()
  }
}
await browser.close()
```

- [ ] **Step 3: Run it**

```bash
cd "$S/pw" && node --experimental-strip-types memory-visual.mjs "$S"; cd - >/dev/null
```
Expected: 8 lines, each `dialog=true geser-X=tidak`. Heights above the viewport (e.g. 40 cards at 640px) are acceptable (the board scrolls) as long as there is no horizontal overflow.

- [ ] **Step 4: Look at the screenshots**

Combine and view the 40-card and 12-card boards at 360 px, and the quiz sheet:
```bash
node -e "
const sharp=require('./node_modules/sharp');
(async()=>{const names=['mem-12-360-board','mem-40-360-board','mem-40-360-quiz','mem-20-390-board'];
const bufs=await Promise.all(names.map(n=>sharp(process.argv[1]+'/shots/'+n+'.png').resize({height:640}).png().toBuffer()));
const metas=await Promise.all(bufs.map(b=>sharp(b).metadata()));let x=0;const comps=bufs.map((b,i)=>{const c={input:b,left:x,top:0};x+=metas[i].width+10;return c});
await sharp({create:{width:x,height:640,channels:3,background:'#888'}}).composite(comps).png().toFile(process.argv[1]+'/shots/mem-montage.png')})()" "$S" && open "$S/shots/mem-montage.png"
```
Check by eye: references readable on the 40-card board at 360 px (no clipped letters), matched cards highlighted, the sheet's four options fully visible and tappable, the sticky bar visible.
If a reference is clipped at 5 columns, reduce `text-[11px]` to `text-[10px]` for `cols === 5` in `TEXT_BY_COLS` and re-run Steps 3–4.

- [ ] **Step 5: Stop the server**

Run: `pkill -f "next start -p 3100"`

- [ ] **Step 6: Checkpoint** (only if `TEXT_BY_COLS` changed)

Suggested commit: `style(memory): tune card text size for 5-column boards`

---

## Task 11: Real-browser flow against local handlers is not possible — verify with the live stack after deploy, and finish docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

In the "Games" list add:
```
- **Memory Ayat** — Cocokkan kartu referensi ayat; tiap pasangan yang ketemu membuka pilihan ganda "apa bunyinya?"
```
In the "Fitur" list add:
```
- Memory Ayat: host mengatur jumlah kartu (12–40) dan berapa lama kartu salah tertutup; papan sama untuk semua pemain, skor dihitung server
```
In the "Setup database" section, after the `supabase db push` instruction, add:
```
Migrasi `20261028000000_memory_match_enum.sql` dan `20261028000001_memory_match.sql` menambah game Memory Ayat.
Jalankan `supabase db push` **sebelum** men-deploy function.
```
In "Tests dan CI" add `npm run test:e2e` (butuh Postgres lokal; lihat `e2e/reset-db.sh`) to the command list and mention that CI runs it with a Postgres service.

- [ ] **Step 2: Run every check**

```bash
npx tsc --noEmit && echo "tsc app ok"
S=/private/tmp/claude-501/-Users-robertokreshna-CG-Tools/1566a0e8-650b-4871-8226-5d0a20f257f5/scratchpad
npx tsc -p $S/tsconfig.fn.json && echo "tsc edge ok"
npm run lint
npm run test:run
bash e2e/reset-db.sh && npm run test:e2e
npx next build 2>&1 | grep -E "Compiled|rror"
```
Expected: all clean; unit tests = previous 76 + new (rules, board, sheet, match, recap, host card, game); e2e = 45 + 11 = 56.

- [ ] **Step 3: Checkpoint**

Suggested commit: `docs: document Memory Ayat and the server test setup`

- [ ] **Step 4: Rollout (done by the repo owner; the executor prepares and verifies)**

1. `supabase db push --db-url "$SUPABASE_DB_URL"` — applies the two new migrations to the Singapore project.
2. Push to `main` → the "Deploy Edge Functions" workflow deploys `rooms` and `sessions`; wait for it to go green.
3. Vercel deploys the frontend.
4. Live check (executor): create a Memory Ayat room through the UI in two real browsers against the live URL, join by link, start, flip a pair, answer the quiz, finish, and confirm the reveal shows standings and the recap. Use the same Playwright pattern as `$S/pw/live-prod.mjs`.

---

## Self-Review (done while writing)

**Spec coverage**
- Rules/config (cards 12/20/30/40, delay, timer formula, single board): Tasks 3 (constants, `memoryTimerMs`), 5 (room validation, `question_count` forced to 1), 9 (UI controls). ✔
- Card content and quiz (identical reference cards, 3 distractors, unique, no repeats): Task 3 `buildBoard` + tests; Task 5 test against real verses. ✔
- Database (enum, columns, `questions.created_at`, cleanup): Task 2. ✔
- Server (board creation as a `questions` row, answer branch, 2000-char cap, `timerMsOf`, reveal payload): Tasks 4–5. ✔
- Result contract and `replayMemory` checks: Task 3 tests cover every rejection listed in the spec. ✔
- Scoring (50/50, factor, penalty, time floor, worked example): Task 3 tests + Task 5 server numbers. ✔
- Player UI (sticky bar, grid, hide delay, sheet with feedback, auto-close, a11y labels, reduced motion via the existing global rule): Task 7. ✔
- Recap with ✓/✗ and host summary: Tasks 8–9. ✔
- Error handling (retry on failed submit, partial submit on expiry, sheet cannot close unanswered): Task 7 tests; reducer (Task 6). ✔
- Release order: Task 11 step 4. ✔

**Placeholder scan:** no "TBD"/"TODO"/"similar to Task N"; every code step has the code.

**Type consistency:** `MemoryBoard` / `MemoryCard` / `MemoryQuiz` / `MemoryResult` defined once in `_shared/memory.ts` and used under the same names in `lib/memory-board.ts`, components, tests, and `types/game.ts`; `timerMsOf`, `maxAnswerLength`, `MAX_MEMORY_ANSWER_LENGTH`, `scoreMemoryAnswer`, `buildBoard` names match between definition (Tasks 3–4) and use (Task 5). Reducer actions `flip | hideMismatch | answer | closeQuiz` match their use in `MemoryMatch`. The state field `chosen` (not `lastAnswer`) is used consistently.

**Known open point:** the exact numbers in the Task 5 scoring assertions (875, 589, 944, 250) were derived by hand from the spec formula with `Math.round`; if any is off by one, the test's expected value (not the formula) is corrected after recomputing — noted in Task 5 Step 8.
