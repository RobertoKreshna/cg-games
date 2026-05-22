# CG Games Platform — Design Spec
_Date: 2026-05-22_

## Overview

Web platform untuk connect group (persekutuan doa) yang menampung beberapa mini-game interaktif. Dimainkan in-person, semua peserta pakai HP masing-masing. Max 30 player per room. Host kontrol jalannya game.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (deploy Vercel) |
| Backend | Supabase Edge Functions + Drizzle ORM |
| Database | Supabase PostgreSQL |
| Realtime | Supabase Realtime (broadcast channel per room) |

---

## Games

Tiga game tersedia di platform:

1. **Bible Quiz** — Kahoot-style multiple choice
2. **Verse Scramble** — susun kata ayat Alkitab yang diacak
3. **Emoji Story** — tebak kisah/lagu rohani dari deretan emoji

---

## User Roles

**Host** — buat room, pilih game & mode, kontrol flow (next question, end game). Tidak perlu register. Diautentikasi via `host_token` (random string) yang disimpan di localStorage.

**Player** — join pakai room code + nama. Tidak perlu register. Session disimpan via `session_token` di localStorage (untuk handle refresh).

---

## Room & Game Flow

```
HOST                            PLAYER
────────────────────────────────────────────────────
Buka app → Create Room
Pilih game type
Dapat room code (6 digit)
                                Join Room → masukin kode
                                Masukin nama → masuk lobby

Lihat daftar player di lobby
Pilih mode: Individual / Team
  (Team → sistem acak pembagian)
Klik "Start Game"
                                Soal muncul di layar
                                Player jawab

Klik "Next" → soal berikutnya  Soal berganti realtime

Setelah soal terakhir:
Klik "Lihat Hasil"              Leaderboard muncul di semua HP
```

---

## Database Schema

```sql
rooms
  id            uuid PK
  code          varchar(6) UNIQUE
  game_type     enum('bible_quiz', 'verse_scramble', 'emoji_story')
  mode          enum('individual', 'team')
  status        enum('lobby', 'playing', 'finished')
  host_token    varchar
  created_at    timestamp

players
  id            uuid PK
  room_id       uuid FK → rooms
  name          varchar
  team_id       uuid FK → teams (nullable)
  session_token varchar

teams
  id            uuid PK
  room_id       uuid FK → rooms
  name          varchar
  color         varchar

game_sessions
  id            uuid PK
  room_id       uuid FK → rooms
  current_question_index  int
  status        enum('waiting', 'question', 'reveal', 'finished')
  started_at    timestamp

questions  (pre-seeded)
  id            uuid PK
  game_type     enum('bible_quiz', 'verse_scramble', 'emoji_story')
  order_index   int
  content       jsonb  -- struktur beda per game type

answers
  id            uuid PK
  player_id     uuid FK → players
  question_id   uuid FK → questions
  session_id    uuid FK → game_sessions
  submitted_answer  text
  is_correct    boolean
  points        int
  time_taken_ms int
```

### Questions content JSON per game type

```json
// bible_quiz
{ "question": "Siapa yang membangun bahtera?", "options": ["Nuh", "Musa", "Abraham", "Daud"], "answer_index": 0 }

// verse_scramble
{ "reference": "Yohanes 3:16", "words": ["dunia", "Allah", "mengasihi", ...], "correct_order": [2,0,1,...] }

// emoji_story
{ "emojis": "🐟🐟🍞🧺", "answer": "mukjizat lima roti dua ikan", "hint": "Yohanes 6" }
```

---

## Points System

**Bible Quiz**
- Base: 1000 pts
- Formula: `1000 - (time_taken_ms / 15000 * 1000)`
- Timer: 15 detik

**Verse Scramble**
- Formula: `(kata_benar / total_kata) * 1000 * speed_multiplier`
- `speed_multiplier = 1.0 - (time_taken_ms / 30000 * 0.5)` → range 0.5–1.0
- Minimum: 0 (tidak bisa negatif)
- Timer: 30 detik

**Emoji Story**
- Exact match: 1000 pts
- Partial match: jawaban mengandung kata kunci utama dari answer (case-insensitive, trimmed) = 500 pts
- Timer: 20 detik
- Host reveal answer setelah timer

**Team mode**: total poin tim = akumulasi semua member di tim tersebut.

---

## Realtime Events (Supabase Realtime channel per room)

| Event | Trigger | Payload |
|---|---|---|
| `player_joined` | player join room | `{ name, player_id }` |
| `teams_assigned` | host acak tim | `{ teams: [{id, name, color, members}] }` |
| `game_started` | host start | `{ session_id }` |
| `question_show` | host next | `{ question_index, content, timer_ms }` |
| `question_reveal` | auto: timer habis atau semua player sudah jawab | `{ correct_answer, scores }` |
| `game_finished` | soal terakhir selesai | `{ leaderboard }` |

---

## Edge Functions

| Function | Method | Auth |
|---|---|---|
| `POST /rooms` | create room | — |
| `POST /rooms/:code/join` | join room | — |
| `POST /rooms/:code/start` | start game | host_token |
| `POST /sessions/:id/next` | next question | host_token |
| `POST /sessions/:id/answer` | submit answer | session_token |
| `GET /sessions/:id/leaderboard` | get results | — |

---

## Pages (Next.js)

- `/` — home, pilih Create atau Join
- `/host` — create room, pilih game, lobby view, game control
- `/join` — input kode + nama
- `/play/:roomCode` — player game view (soal + timer)
- `/results/:sessionId` — leaderboard final

---

## Out of Scope (v1)

- Auth / user accounts
- Custom question editor (questions pre-seeded)
- Persistent history / statistik antar sesi
- Sound effects / animasi kompleks
