# Memory Ayat — Design Spec
_Date: 2026-10-28_

## Ringkasan

Game keempat: **Memory Ayat**. Kartu menampilkan **referensi ayat** (mis. "Yohanes 3:16"), dan tiap referensi ada di
**dua kartu kembar**. Pemain membalik kartu untuk menemukan pasangan kembarnya. Begitu sepasang ketemu, muncul
**pilihan ganda**: "Apa bunyi Yohanes 3:16?" dengan 4 teks ayat. Jadi game ini melatih ingatan posisi kartu sekaligus hafalan ayat.

Semua pemain mengerjakan **papan yang sama di HP masing-masing, bersamaan** (balapan). Satu papan per game.
Host mengatur jumlah kartu dan berapa lama kartu yang salah tetap terbuka.

Mengikuti pola game yang sudah ada: host buat room, pemain gabung, host mulai, semua main, reveal + klasemen.

## Keputusan yang sudah diambil

| Topik | Keputusan |
|---|---|
| Bentuk | Balapan paralel di HP (bukan bergiliran di layar bersama) |
| Isi kartu | Dua kartu kembar per referensi; ayat diambil dari 100 ayat Verse Scramble (tanpa konten baru) |
| Setelah cocok | Pilihan ganda 4 teks ayat (1 benar + 3 pengecoh), **menghalangi papan sampai dijawab**, tanpa tombol lewati |
| Umpan balik | Langsung ("Benar!" / "Salah, jawabannya: …") sekitar 2 detik; jawaban benar ikut terkirim ke HP (trade-off, lihat Keamanan) |
| Papan | 1 papan per game, urutan kartu dan pilihan sama untuk semua pemain |
| Konfigurasi host | Jumlah kartu: 12 / 20 / 30 / 40. Kartu salah tertutup setelah: 0,5 / 1 / 2 / 3 detik |
| Validasi | Papan dikirim ke HP, dimainkan lokal, **hasil diverifikasi dan dinilai server** |

## Di luar cakupan

Beberapa papan per game, giliran antar pemain, progres pemain lain secara langsung, suara, paket tema selain ayat,
konten pasangan yang ditulis tangan, waktu per pilihan ganda, tombol lewati.

## Aturan main

- Host memilih game "Memory Ayat". Pilihan "Jumlah soal" disembunyikan; game selalu 1 papan.
- **Jumlah kartu** `N` ∈ {12, 20, 30, 40} (default 20), yaitu `N/2` pasang. Grid (kolom × baris): 12 → 3×4, 20 → 4×5, 30 → 5×6, 40 → 5×8.
- **Penundaan tutup** `hideMs` ∈ {500, 1000, 2000, 3000} (default 1000): berapa lama dua kartu yang tidak cocok tetap terlihat.
- **Batas waktu** = `(N/2) × 10000 + 20000` ms (40 kartu = 220 detik; 20 kartu = 120 detik). Dihitung otomatis. Mencakup waktu menjawab.
- Pemain mengetuk kartu. Dua kartu terbuka dibandingkan:
  - **Tidak cocok** → keduanya tertutup lagi setelah `hideMs`; selama itu ketukan lain diabaikan; hitungan salah +1.
  - **Cocok** → kartu tetap terbuka; **lembar pilihan ganda** muncul dan menghalangi papan. Setelah memilih, umpan balik tampil
    ± 2 detik (bisa diketuk untuk lanjut lebih cepat), lalu lembar tertutup.
- Selesai bila semua pasangan ditemukan **dan dijawab** (hasil langsung dikirim) atau waktu habis (hasil sebagian dikirim).
- Setelah reveal, rekap menampilkan tiap ayat di papan dengan ✓ / ✗ untuk jawaban pemain.

## Isi kartu dan pilihan ganda

Satu pasang = satu ayat Verse Scramble `{ reference, text }` (`text` = kata berurutan menurut `correct_order`).
- Dua kartu kembar menampilkan `reference` (pendek, median 11 karakter, cukup untuk kartu kecil di 40 kartu).
- Pilihan ganda = `text` yang benar + **3 pengecoh**: `text` ayat lain dari pool, berbeda satu sama lain dan berbeda dari yang benar,
  posisi diacak sekali saat papan dibuat.
- Ayat di satu papan tidak berulang. Referensi di seed semuanya unik, jadi pasangan tidak ambigu.

## Arsitektur

### Database (migrasi baru, dijalankan sebelum function di-deploy)

- `alter type game_type add value 'memory_match'` (file migrasi tersendiri, tidak dipakai di file yang sama).
- `rooms.memory_cards int not null default 20 check (memory_cards in (12,20,30,40))`
- `rooms.memory_delay_ms int not null default 1000 check (memory_delay_ms in (500,1000,2000,3000))`
- `questions.created_at timestamptz not null default now()`, dan `cleanup_old_rooms()` ikut menghapus baris
  `questions` bertipe `memory_match` yang lebih tua dari batas usia (papan dibuat per game, jadi tidak boleh menumpuk).

### Server (`supabase/functions`)

- **`_shared/memory.ts`** (fungsi murni, tanpa impor, bisa diuji dari Next.js seperti `game.ts`):
  - `buildBoard(verses, cardCount, hideMs, random)` → konten papan (lihat Kontrak data).
  - `memoryTimerMs(cardCount)`.
  - `replayMemory(board, result)` → `{ matched, mistakes, moves, answered, correct, complete }` atau error.
  - `scoreMemory(...)` dan `minMemoryTimeMs(moves, answered)`.
- **`POST /rooms`**: terima `memory_cards` dan `memory_delay_ms` (divalidasi terhadap daftar di atas, hanya relevan untuk
  `memory_match`). Untuk game ini `question_count` dipaksa 1.
- **`POST /sessions/:id/next`** (panggilan pertama): untuk `memory_match`, ambil ayat dari soal `verse_scramble`, `buildBoard`,
  simpan sebagai **satu baris `questions`** (`game_type = 'memory_match'`) agar foreign key `answers.question_id` tetap
  berlaku, lalu jadikan satu-satunya elemen `question_ids` sesi.
- **`POST /sessions/:id/answer`**: cabang `memory_match` pada `scoreAnswer`. Batas panjang `submitted_answer` untuk game ini
  2000 karakter (game lain tetap 500).
- **Timer per soal**: tambah `timerMsOf(gameType, content)` di `game.ts` yang mengembalikan `content.timerMs` bila ada, jika tidak
  `TIMER_MS[gameType]`. Dipakai server (`sessions` answer), host (auto-reveal), dan komponen game. `TIMER_MS.memory_match`
  diisi 220000 (40 kartu) hanya sebagai nilai cadangan agar tipe `Record<GameType, number>` lengkap; yang dipakai adalah `content.timerMs`.
  Host sudah menerima konten publik lewat `question_show` dan `host-state.currentQuestion`, jadi `timerMs` tersedia di sana.
- `publicContent` untuk `memory_match` tidak menghapus apa pun (papan dan pilihan memang dikirim); `correctAnswerOf` mengembalikan
  daftar indeks jawaban benar per pasangan agar alur reveal dan pemulihan state yang sudah ada tetap berfungsi.

### Frontend

- `types/game.ts`: `GameType` + `'memory_match'`, `MemoryCard`, `MemoryQuiz`, `MemoryMatchContent`, `MemoryResult`.
- **`lib/memory.ts`**: reducer murni untuk state papan (kartu terbuka, pasangan cocok, salah, urutan flip, jawaban pilihan ganda,
  kunci, lembar terbuka, selesai).
- **`components/games/MemoryMatch.tsx`**: papan, bar atas yang menempel, pengiriman hasil lewat `submitAnswer`.
- **`components/games/MemoryQuizSheet.tsx`**: lembar pilihan ganda (dialog modal), umpan balik, tutup otomatis.
- `app/play/[roomCode]/page.tsx`: cabang untuk `memory_match`; layar reveal menampilkan rekap ayat dengan ✓/✗.
- `app/host/page.tsx`: opsi game baru, dua pilihan konfigurasi, `HostQuestionCard` cabang `memory_match`, deadline auto-reveal
  memakai `timerMsOf`.
- `lib/api.ts`: `createRoom` menerima konfigurasi memori.

## Kontrak data

**Konten papan** (disimpan di `questions.content`, dikirim apa adanya ke pemain):

```ts
{
  cols: number,            // 3 | 4 | 5
  hideMs: number,
  timerMs: number,
  cards: { id: number, pair: number, text: string }[],        // sudah diacak; id = posisi; text = referensi
  quiz: { pair: number, options: string[4], answer: number }[], // 1 entri per pasang; answer = indeks opsi benar
}
```

**Hasil pemain** (`submitted_answer`): JSON

```ts
{ "f": number[],              // urutan id kartu yang dibuka; dibaca berpasangan (langkah = flip ke-1 dan ke-2)
  "q": [number, number][] }   // [pair, indeksOpsi] untuk tiap pilihan ganda yang dijawab
```

Flip terakhir yang tidak berpasangan diabaikan.

**Pemeriksaan `replayMemory`** (hasil ditolak dengan 400 bila): bukan bentuk di atas, id kartu di luar `0..N-1` atau bukan bilangan bulat,
dua flip dalam satu langkah pada kartu yang sama, membuka kartu yang sudah cocok, panjang `f` melebihi `N × 6`,
`q` untuk pasangan yang belum cocok menurut `f`, pasangan yang dijawab dua kali, atau indeks opsi di luar `0..3`.

## Penilaian

```
dasar   = 500 × (pasangan ditemukan / total) + 500 × (jawaban benar / total)
faktor  = 1 − 0,5 × (waktu / timerMs)          // 1,0 sampai 0,5
poin    = max(0, round(dasar × faktor) − 20 × salahTebakKartu)
isCorrect = semua pasangan ditemukan
```

Contoh: 10 pasang, 70 dtk dari 120, 4 salah tebak, 8 benar → dasar 900, faktor ≈ 0,71, poin ≈ 557.

`waktu` = `effectiveTimeMs` yang sudah ada (waktu server menang atas klaim klien), dengan lantai tambahan
`max(waktu, langkah × 500 + dijawab × 1000)` agar hasil yang mustahil cepat tidak lolos. Jawaban setelah tenggat + masa tenggang
tetap bernilai 0, sama seperti game lain. Konstanta (`10000`, `20000`, `500`, `20`, `500`, `1000`) ada di `_shared/game.ts` / `_shared/memory.ts`.

## Keamanan dan kecurangan

Papan, pasangan, dan jawaban pilihan ganda dikirim ke HP, jadi pemain yang membuka dev tools bisa membaca pasangan **dan jawabannya**.
Ini **trade-off yang disetujui** demi permainan yang terasa instan dan umpan balik langsung. Yang tetap dijaga server: waktu dihitung
server, hasil diputar ulang dan divalidasi, dan lantai waktu per langkah dan per jawaban membatasi keuntungan dari membaca data.
Bukan antikecurangan sempurna; cukup untuk game santai di CG.

## Tampilan

**Pemain**
- Bar atas menempel: `pasangan ditemukan / total · salah · timer`.
- Grid kartu; kartu tertutup menampilkan motif, kartu terbuka menampilkan referensi, kartu cocok bersorot. Teks referensi pendek,
  jadi terbaca juga di 40 kartu; font menyesuaikan jumlah kartu, dan papan boleh digulir bila HP terlalu pendek.
- Lembar pilihan ganda: dialog modal dari bawah, judul "{referensi} — Apa bunyinya?", 4 tombol lebar penuh. Setelah memilih,
  jawaban benar disorot hijau dan yang salah merah; tutup otomatis ± 2 detik atau saat diketuk.
- Animasi dimatikan bila `prefers-reduced-motion`. Tiap kartu adalah `<button>` dengan label
  ("Kartu 5, tertutup" / "Kartu 5, terbuka: Yohanes 3:16"), bisa dioperasikan dengan keyboard. Lembar pilihan ganda menangkap fokus.
- Setelah selesai: layar menunggu yang sudah ada (poin tampil), lalu reveal dengan klasemen dan rekap ayat (✓/✗).

**Host**
- Konfigurasi: dua kontrol segmen di layar buat room saat "Memory Ayat" dipilih; "Jumlah soal" disembunyikan.
- Layar game: kartu ringkasan "Memory Ayat · 10 pasang"; daftar siapa yang sudah selesai memakai chip yang sudah ada;
  setelah reveal, rekap ayat. Tombol akhir memakai label "Lihat Hasil Akhir" (hanya satu papan).

## Penanganan error

- Hasil tidak valid → 400, pemain melihat pesan "Hasil tidak terkirim" dan bisa mencoba lagi selama waktu masih ada
  (mekanisme `sendError` yang sudah ada).
- Pool ayat kurang dari `N/2 + 3` (pasang + pengecoh) → room tidak bisa dibuat dengan konfigurasi itu (tidak terjadi dengan 100 ayat
  dan N maksimal 40, tetap diperiksa).
- Pemain yang refresh di tengah papan mulai dari papan kosong (progres tidak disimpan di server); timer tetap berjalan dari
  waktu server seperti game lain.
- Lembar pilihan ganda tidak bisa ditutup tanpa memilih; bila waktu habis saat terbuka, jawaban yang belum dipilih dihitung salah dan
  hasil dikirim.

## Pengujian

- **Unit (`_shared/memory.ts`, lewat `@/lib/...` seperti `game.ts`)**: `buildBoard` (jumlah kartu, tiap referensi tepat dua kartu,
  tanpa ayat ganda, urutan teracak, deterministik dengan `random` palsu, 4 opsi per pasang, pengecoh unik dan berbeda dari
  jawaban, `answer` menunjuk opsi yang benar), `replayMemory` (permainan sempurna, banyak salah, sebagian, flip tak berpasangan,
  kartu sama dua kali, id tak valid, kartu yang sudah cocok, terlalu panjang, jawaban untuk pasangan yang belum cocok, dijawab dua
  kali, opsi di luar jangkauan), `scoreMemory` (pembagian 50/50, batas bawah/atas, penalti salah), `minMemoryTimeMs`.
- **Unit (`lib/memory.ts`)**: reducer (flip pertama, cocok membuka lembar, tidak cocok + kunci, jawaban benar/salah, selesai hanya
  setelah semua dijawab, ketukan saat terkunci atau lembar terbuka diabaikan).
- **Komponen**: `MemoryMatch` (ketuk, penundaan sesuai `hideMs` dengan fake timers, kirim saat selesai dan saat waktu habis),
  `MemoryQuizSheet` (memilih, umpan balik, tutup otomatis, fokus).
- **Server (harness database lokal)**: pembuatan room dengan konfigurasi valid/tidak valid, `question_count` dipaksa 1,
  papan sama untuk semua pemain, jawaban valid/tidak valid, penilaian, reveal setelah semua selesai, `cleanup_old_rooms` menghapus
  papan lama.
- **Visual (Playwright, data tiruan)**: 12/20/30/40 kartu di 360×640 dan 390×844 (keterbacaan referensi, lembar pilihan ganda,
  tombol tetap terjangkau).
- Semua tes yang ada tetap lolos.

## Urutan rilis

1. Jalankan migrasi (`supabase db push`).
2. Deploy function (push ke `main`).
3. Deploy frontend. Frontend lama tidak terpengaruh (tidak menawarkan game baru, dan tidak ada perubahan kontrak game lama).

## Kriteria selesai

- Host bisa membuat room Memory Ayat dengan 12/20/30/40 kartu dan 4 pilihan penundaan.
- Papan 40 kartu bisa dimainkan di HP 390×844 dan referensi terbaca di 360×640.
- Pasangan cocok memunculkan pilihan ganda; skor dihitung server dari hasil yang divalidasi; hasil tidak valid ditolak.
- Reveal menampilkan klasemen dan rekap ayat (✓/✗); host melihat siapa yang sudah selesai.
- Lint, type-check, dan semua tes (lama dan baru) lolos.
