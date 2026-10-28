# CG Games

Platform game interaktif berbasis web untuk connect group / persekutuan doa. Dimainkan in-person — semua peserta pakai HP masing-masing.

## Games

- **Bible Quiz** — Kahoot-style multiple choice dengan timer 15 detik
- **Verse Scramble** — Susun kata-kata ayat Alkitab yang diacak
- **Emoji Story** — Tebak kisah/lagu rohani dari deretan emoji

## Fitur

- Room system dengan 6-karakter kode; pemain gabung dengan **scan QR** atau buka link `/join?code=XXXXXX` (kode terisi otomatis)
- Host mengontrol jalannya game (soal berikutnya, tampilkan jawaban lebih awal)
- Mode Individual atau Tim (tim diacak otomatis); skor tim = rata-rata poin per anggota
- Klasemen sementara tampil di setiap reveal, leaderboard di akhir
- Hingga 30 player per room, nama harus unik di dalam room
- Jawaban benar tidak dikirim ke HP pemain sampai soal di-reveal; waktu dihitung server
- Jawaban otomatis ditampilkan saat waktu habis
- Pemain yang terputus bisa masuk lagi dengan nama yang sama; timer dan state dipulihkan setelah refresh
- Banner "Koneksi terputus" muncul kalau koneksi hilang lebih dari beberapa detik, dan layar HP ditahan tetap menyala selama bermain
- Error browser dan edge function dikirim ke Discord (opsional)
- Tidak perlu registrasi — join pakai nama saja

## Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **Backend**: Supabase Edge Functions + Drizzle ORM
- **Database**: Supabase PostgreSQL
- **Realtime**: Supabase Realtime (Broadcast)
- **Deploy**: Vercel (frontend), GitHub Actions (edge functions)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Buat project Supabase

Pilih region yang **sama dengan mayoritas pemain** (untuk Indonesia: **Southeast Asia (Singapore)**).
Edge function dijalankan di region terdekat dari pemain, jadi kalau database ada di region lain,
setiap request harus bolak-balik lintas region. Di project Seoul dulu median satu request sekitar
1,1 detik; setelah pindah ke Singapura sekitar 0,34 detik. Region project tidak bisa diubah setelah
dibuat — pindah region berarti membuat project baru.

### 3. Environment variables

Buat file `.env.local` (lihat juga `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_DB_URL=postgresql://postgres.xxx:password@...pooler.supabase.com:5432/postgres

# opsional
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Yang dipakai di **Vercel** hanya `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(plus `DISCORD_WEBHOOK_URL` kalau mau). `SUPABASE_SERVICE_ROLE_KEY` dan `SUPABASE_DB_URL` hanya untuk
perintah lokal; edge function mendapatkannya otomatis dari Supabase. Variabel `NEXT_PUBLIC_*` ditanam
saat build, jadi **redeploy setiap kali mengubahnya**.

### 4. Setup database

Dengan Supabase CLI (sudah login, `supabase login`):

```bash
supabase db push --db-url "$SUPABASE_DB_URL"      # menjalankan semua migration di supabase/migrations
psql "$SUPABASE_DB_URL" -f supabase/seed.sql      # 250 soal
```

Lalu jadwalkan pembersihan room lama (di SQL Editor, sekali saja). Room tidak pernah dihapus oleh
aplikasi, jadi tanpa ini data menumpuk:

```sql
create extension if not exists pg_cron;
select cron.schedule('cleanup-old-rooms', '0 3 * * *', $$ select cleanup_old_rooms(); $$);
```

Fungsi `cleanup_old_rooms()` menghapus room lebih dari 7 hari beserta pemain dan jawabannya.

### 5. Deploy Edge Functions

Otomatis lewat GitHub Actions setiap push ke `main` yang mengubah `supabase/functions/**`
(`.github/workflows/deploy-functions.yml`). Butuh dua secret di repo
(Settings → Secrets and variables → Actions):

- `SUPABASE_PROJECT_ID` — project ref (bagian depan URL `https://<ref>.supabase.co`)
- `SUPABASE_ACCESS_TOKEN` — token akun (Supabase Dashboard → Account → Access Tokens)

Kalau pindah project, ganti `SUPABASE_PROJECT_ID`, lalu jalankan workflow lewat "Run workflow".

Manual (tanpa Docker):

```bash
supabase functions deploy rooms --no-verify-jwt --use-api --project-ref <ref>
supabase functions deploy sessions --no-verify-jwt --use-api --project-ref <ref>
```

### 6. Notifikasi error ke Discord (opsional)

Buat webhook di channel Discord, lalu pasang di dua tempat (keduanya perlu):

- **Vercel** (untuk error di browser): tambahkan environment variable `DISCORD_WEBHOOK_URL`, lalu redeploy.
- **Supabase** (untuk error di edge function): dashboard → Edge Functions → Secrets, atau
  `supabase secrets set DISCORD_WEBHOOK_URL=... --project-ref <ref>`

Jangan commit URL webhook. Kalau URL-nya bocor, hapus webhook di Discord dan buat yang baru.

### 7. Run dev server

```bash
npm run dev
```

## Cara Main

1. **Host** buka app → "Buat Room" → pilih game & mode
2. **Player** scan QR di layar host (atau buka "Gabung Room" dan masukkan kode) → isi nama
3. Host klik "Mulai Game" → soal muncul di semua HP
4. Setelah semua soal → lihat leaderboard

## Aturan game

Skor, timer, dan validasi jawaban ada di satu tempat: `supabase/functions/_shared/game.ts`.
Edge functions dan frontend (`lib/scoring.ts`) memakai file yang sama.

## Batasan plan gratis Supabase

- Project di-**pause** kalau hampir tidak ada aktivitas selama sekitar 7 hari. Kalau game tidak jalan
  setelah lama tidak dipakai, buka dashboard → pilih project → **Resume project** (data tetap ada).
  Sebaiknya buka aplikasi sehari sebelum sesi penting.
- Realtime: sekitar 200 koneksi bersamaan (kira-kira 6 room penuh sekaligus) dan 2 juta pesan per bulan.
- Edge functions: 500.000 pemanggilan per bulan.

## Tests dan CI

```bash
npm run lint
npx tsc --noEmit
npm run test:run
```

Semuanya juga dijalankan GitHub Actions di setiap pull request dan push ke `main`
(`.github/workflows/ci.yml`).
