# CG Games

Platform game interaktif berbasis web untuk connect group / persekutuan doa. Dimainkan in-person — semua peserta pakai HP masing-masing.

## Games

- **Bible Quiz** — Kahoot-style multiple choice dengan timer 15 detik
- **Verse Scramble** — Susun kata-kata ayat Alkitab yang diacak
- **Emoji Story** — Tebak kisah/lagu rohani dari deretan emoji

## Fitur

- Room system dengan 6-digit code
- Host mengontrol jalannya game (next question, end game)
- Mode Individual atau Tim (tim diacak otomatis)
- Leaderboard real-time
- Hingga 30 player per room
- Tidak perlu registrasi — join pakai nama saja

## Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **Backend**: Supabase Edge Functions + Drizzle ORM
- **Database**: Supabase PostgreSQL
- **Realtime**: Supabase Realtime (Broadcast)
- **Deploy**: Vercel

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Buat file `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_DB_URL=postgresql://postgres.xxx:password@...pooler.supabase.com:6543/postgres
```

### 3. Setup database

Jalankan migration di Supabase SQL Editor:

```
supabase/migrations/20260522000000_initial.sql
```

Lalu seed questions:

```
supabase/seed.sql
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy rooms --no-verify-jwt
supabase functions deploy sessions --no-verify-jwt
```

### 5. Run dev server

```bash
npm run dev
```

## Cara Main

1. **Host** buka app → "Buat Room" → pilih game & mode → share kode
2. **Player** buka app → "Gabung Room" → masukkan kode + nama
3. Host klik "Mulai Game" → soal muncul di semua HP
4. Setelah semua soal → lihat leaderboard

## Tests

```bash
npm run test:run
```
