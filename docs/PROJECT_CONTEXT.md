# IS Lab Study Hub — Konteks Proyek untuk Sesi Planning

> **Untuk Claude:** Dokumen ini adalah ringkasan lengkap proyek web yang sudah saya bangun (bersama Claude Code). Kamu tidak punya akses ke kodenya, jadi semua yang perlu kamu tahu ada di sini. Saya ingin **merencanakan pengembangan berikutnya** bersamamu: bantu saya menentukan prioritas fitur, memecahnya jadi tahapan yang realistis, dan menimbang trade-off-nya. Tanyakan dulu hal yang belum jelas sebelum memberi rencana final. Hasil akhirnya akan saya bawa kembali ke Claude Code untuk diimplementasikan, jadi buat rencana yang konkret (fitur → perubahan data/halaman → urutan pengerjaan).

---

## 1. Apa ini dan untuk siapa

**IS Lab Study Hub** adalah web app **pribadi** (satu pengguna: saya) untuk mencatat perjalanan belajar Machine Learning & Data Science selama program magang/mentee di **IS Lab**.

- Program berjalan per minggu. **Week 1 dimulai 29 September 2026** (sebelum itu dihitung "Onboarding"/Week 0).
- Setiap minggu saya wajib mengirim **Weekly Progress** ke mentor (Sabtu/Minggu) sesuai template *Guidebook Mentee IS Lab*, dan melaporkan progres proyek kelompok (reproduksi paper, dataset, training, evaluasi, dst.) di weekly meeting.
- Tujuan app: satu tempat untuk silabus, catatan, sumber belajar, dan laporan mingguan, supaya laporan bisa disusun cepat dari aktivitas yang sudah tercatat.
- Bahasa UI: **Bahasa Indonesia**. Pertanyaan di template laporan sengaja dipertahankan persis seperti guidebook (sebagian dalam bahasa Inggris).

## 2. Tech stack

| Bagian | Teknologi |
|---|---|
| Framework | **Next.js 16.3** (App Router, Server Components, Server Actions), React 19.2, TypeScript 5 |
| Styling | Tailwind CSS v4, ikon `lucide-react`, dukungan dark mode |
| Backend | **Supabase**: Postgres + Auth (email/password) + Storage, semua dijaga **Row Level Security** |
| Markdown | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (rumus LaTeX) |
| Export | `docx` (Word dibuat di server), PDF lewat print browser (`window.print()` + CSS print) |
| Hosting target | **Vercel**, region function `syd1` (Sydney), searah dengan Supabase `ap-southeast-2` |

Catatan Next.js 16: middleware sekarang bernama **`proxy.ts`**, dan ada beberapa breaking change dibanding Next 13–15.

## 3. Arsitektur singkat

- **Gerbang login (`src/proxy.ts`)**: me-refresh cookie sesi Supabase di setiap request dan mengarahkan ke `/login` kalau belum login. Path publik hanya `/login`, `/auth`, dan `/r/<token>` (laporan yang dibagikan).
- **Baca data**: Server Components memanggil Supabase dari server (`requireUser()` → client Supabase yang sudah terautentikasi). Beberapa query paralel per halaman (`Promise.all`).
- **Tulis data**: Server Actions di `src/lib/actions/*` (subjects, syllabus, notes, resources, reports, auth). Setiap action memanggil `requireUser()`, memvalidasi input, lalu `revalidatePath("/", "layout")`. Action mengembalikan `{ error }` kalau gagal.
- **Keamanan**: hanya memakai *publishable/anon key*. Tidak ada `service_role` di app. Setiap tabel punya kolom `user_id default auth.uid()` dan policy RLS "owner full access". Role `anon` tidak punya akses tabel sama sekali.
- **Upload file**: browser mengunggah langsung ke bucket privat `documents` (path `<user_id>/<file>`, maks 50 MB). Server Action hanya menyimpan `storage_path`. File dibuka lewat route `/api/files` yang membuat **signed URL** (berlaku 10 menit).
- **Performa**: menu di-prefetch, client router cache (`staleTimes` 180/300 detik), filter dan pencarian di halaman Catatan/Sumber berjalan di browser tanpa request ke server.
- **Link berbagi laporan**: token acak 24 karakter disimpan di `weekly_reports.share_token`. Halaman publik membaca data lewat fungsi Postgres `get_shared_report(token)` (SECURITY DEFINER), jadi tabel tetap tertutup untuk anon.

## 4. Fitur yang sudah ada

### Dashboard (`/`)
- Sapaan sesuai jam, tanggal hari ini.
- Pengingat laporan minggu ini (belum dibuat / masih draft), lengkap dengan nomor Week dan periode.
- Statistik: topik selesai (x/y dan %), topik sedang dipelajari, total catatan, hari belajar dalam 7 hari terakhir (dihitung dari tanggal catatan).
- "Fokus sekarang": topik yang sedang dipelajari dan topik yang targetnya terlambat atau jatuh dalam 14 hari.
- Progres per subjek (progress bar), 4 catatan terbaru, antrian belajar (sumber yang belum selesai).
- Halaman sambutan 4 langkah kalau belum ada subjek.

### Subjek & Silabus (`/subjects`, `/subjects/[id]`)
- Subjek punya judul, deskripsi, dan warna (7 pilihan).
- Silabus: tambah satu topik, atau **tempel banyak topik sekaligus** (satu per baris, penanda list seperti `1.`, `-`, `[ ]` dibersihkan otomatis, maks 200).
- Tiap topik: status (belum mulai / sedang dipelajari / selesai), target tanggal, deskripsi, urutan (naik/turun). `completed_at` terisi otomatis lewat trigger.
- Tab di halaman subjek (silabus/catatan/sumber) berjalan di browser.

### Catatan (`/notes`)
- Markdown + LaTeX (`$…$`, `$$…$$`), tabel, blok kode.
- Bisa dikaitkan ke subjek dan topik silabus, diberi tag, punya tanggal belajar (`learned_on`).
- Pencarian teks (judul, tag, isi) dan filter (subjek, topik, tag) di browser.

### Sumber Belajar (`/resources`)
- Tipe: YouTube, dokumen, artikel, kursus, lainnya. Tipe ditebak otomatis dari URL.
- YouTube: judul diambil otomatis lewat oEmbed, thumbnail dari `i.ytimg.com`.
- Bisa berupa link **atau** upload file (PDF, slide, notebook) ke Supabase Storage. File lama dihapus otomatis kalau diganti atau sumbernya dihapus.
- Status belajar per sumber, catatan singkat, dan kaitan ke subjek/topik.

### Laporan Mingguan (`/reports`)
- Satu laporan per minggu (unik per `week_number`). Nomor Week dan periode (Senin–Minggu) dihitung otomatis dari `program_start` di profil.
- **Learning Progress** (4 pertanyaan guidebook): *What did you work on this week? / What did you learn or discover? / What was your main challenge? / What is your target for next week?*
- **Project Progress** (4 poin weekly meeting): yang sudah dilakukan, keputusan kelompok, rencana berikutnya, kendala.
- Kolom tautan tambahan. Semua isian berformat Markdown.
- **Isi otomatis**: tombol untuk menyusun draf "worked on" dan "learned" dari aktivitas minggu itu (topik yang selesai/sedang dipelajari, sumber yang disentuh, kalimat pertama tiap catatan).
- Status draft/terkirim (dengan `sent_at`).
- Export: **PDF** (print browser), **Word (.docx)**, **salin teks format chat WhatsApp/Telegram**.
- **Link publik** tanpa login, bisa dibuat dan dimatikan kapan saja. Di halaman publik juga bisa unduh PDF/Word.
- Profil (nama, nomor & nama kelompok, nama mentor, tanggal mulai program) muncul di kepala laporan.

### Auth
- Login email + password. **Pendaftaran publik dimatikan**, akun dibuat manual di dashboard Supabase.
- Logout lewat `/auth/signout`.

## 5. Model data (Supabase / Postgres)

Semua tabel: `id uuid`, `user_id` (default `auth.uid()`), `created_at`, `updated_at` (trigger otomatis), RLS owner-only.

| Tabel | Kolom penting | Relasi |
|---|---|---|
| `subjects` | `title`, `description`, `color` | — |
| `syllabus_items` | `title`, `description`, `position`, `status`, `target_date`, `completed_at` | → `subjects` (cascade) |
| `notes` | `title`, `content` (Markdown), `tags text[]`, `learned_on` | → `subjects`, → `syllabus_items` (set null) |
| `resources` | `title`, `type`, `url` **atau** `storage_path`, `status`, `notes` | → `subjects`, → `syllabus_items` (set null) |
| `profiles` | `full_name`, `group_number`, `group_name`, `mentor_name`, `program_start` | PK = `user_id` |
| `weekly_reports` | `week_number` (0–52), `period_start/end`, 4 kolom `learning_*`, 4 kolom `project_*`, `links`, `status`, `sent_at`, `share_token` | unik (`user_id`, `week_number`) |

Storage: bucket privat `documents`, policy berdasarkan folder `<user_id>/`.

Skema ada di `supabase/migrations/` (Supabase CLI): `20261113000000_initial_schema.sql` (tabel inti) dan `20261113000100_weekly_reports.sql` (profil + laporan). Perubahan berikutnya dibuat sebagai file migrasi baru.

## 6. Struktur folder (ringkas)

```
supabase/migrations/                          migrasi database (Supabase CLI)
src/proxy.ts                                  gerbang login
src/lib/supabase/                             client Supabase (server, browser, proxy)
src/lib/actions/                              Server Actions per fitur
src/lib/report-template.ts                    pertanyaan guidebook, hitungan Week, format chat
src/lib/report-docx.ts                        generator Word
src/app/login/                                halaman login
src/app/(app)/                                halaman yang butuh login (dashboard, subjects, notes, resources, reports)
src/app/r/[token]/                            halaman publik laporan yang dibagikan
src/app/api/files/                            signed URL untuk file upload
src/components/                               komponen UI
```

Ukuran: sekitar 6.400 baris TypeScript/TSX/SQL/CSS.

## 7. Kondisi saat ini (per 14 November 2026, sekitar Week 7 program, setelah Fase 0)

- ✅ Jalan di lokal (`npm run dev`). Dependensi terpasang, env sudah diisi.
- ✅ Semua tabel (termasuk `profiles` dan `weekly_reports`) sudah ada di Supabase. Laporan Mingguan bisa dipakai.
- ✅ Kode ada di repo GitHub **privat**.
- ✅ Supabase CLI (devDependency) terhubung ke project. Skema dikelola sebagai migrasi di `supabase/migrations/` dan riwayatnya sinkron dengan remote.
- ✅ Tipe TypeScript hasil generate ada di `src/lib/supabase/database.types.ts` (`npm run db:types`). Kode lama masih memakai tipe manual di `src/lib/types.ts`.
- ✅ Unit test dengan Vitest (`npm test`).
- ✅ Backup database (dump skema + data) disimpan di luar repo.
- ⚠️ Belum terlihat tanda deploy ke Vercel.
- ⚠️ Tidak ada fitur lupa/ganti password di app. Reset hanya lewat SQL di Supabase.
- ⚠️ Belum ada CI.
- ⚠️ `npm audit` melaporkan kerentanan pada dependensi produksi (termasuk `next` 16.3.6), perlu upgrade terpisah.
- ⚠️ Belum ada soft delete (`deleted_at`). Ini dibutuhkan kalau nanti ada sinkronisasi offline ke mobile.

## 8. Rencana/ide yang sudah pernah terpikir

- **Mobile app** (Expo/React Native atau Flutter) memakai project Supabase yang sama. Desain DB sudah disiapkan untuk ini: UUID, `user_id default auth.uid()`, `updated_at` untuk sync inkremental, opsi Supabase Realtime. Perlu ditambah `deleted_at` untuk offline sync penuh.
- **Deploy ke Vercel** dengan region yang cocok dengan Supabase.

### Kandidat ide lain (belum diputuskan, silakan dikritik)
- Halaman ganti password dan alur lupa password.
- Pencarian global (catatan + sumber + topik) dan full-text search di Postgres.
- Flashcard / spaced repetition dari catatan.
- Timer belajar / log durasi belajar per hari, heatmap aktivitas.
- Ringkasan otomatis dengan LLM (merangkum catatan seminggu jadi draf laporan yang lebih natural, atau tanya-jawab atas catatan sendiri).
- Fitur kelompok: berbagi progres proyek dengan anggota kelompok atau mentor (akan mengubah model "satu pengguna").
- Log eksperimen ML (dataset, hyperparameter, metrik) yang terhubung ke Project Progress.
- Import/export data (backup JSON/Markdown).
- PWA (bisa di-install di HP) sebagai langkah sebelum mobile app native.

## 9. Batasan dan prinsip yang ingin dipertahankan

- Tetap sederhana dan cepat untuk dipakai harian. Ini alat pribadi, bukan produk untuk banyak orang (kecuali kita putuskan sebaliknya).
- Keamanan lewat RLS. Jangan pernah memakai `service_role` key di app.
- Biaya rendah: idealnya tetap di free tier Supabase + Vercel.
- Template laporan harus tetap sesuai guidebook IS Lab.
- Logika data sebisa mungkin tetap di Supabase supaya mobile app nanti bisa memakai backend yang sama.

## 10. Yang saya butuhkan dari sesi planning ini

1. Bantu saya memutuskan **apa yang paling bernilai** untuk dikerjakan berikutnya, mengingat program sedang berjalan (sekitar Week 7) dan saya memakainya setiap minggu.
2. Susun **roadmap bertahap** (misalnya: beres-beres dulu → fitur prioritas → eksplorasi), dengan perkiraan usaha kasar per item.
3. Untuk setiap fitur yang dipilih, jelaskan: perubahan tabel/kolom, halaman/komponen yang terdampak, dan risikonya.
4. Tanyakan ke saya hal-hal yang perlu diputuskan (misalnya: tetap single-user atau mulai multi-user? mobile app sekarang atau nanti?).
