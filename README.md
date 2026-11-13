# IS Lab Study Hub

Platform pribadi untuk mencatat perjalanan belajar Machine Learning & Data Science di IS Lab:

- **Subjek & Silabus**: kelompokkan materi per bidang, tempel silabus (satu topik per baris), lalu tandai progres per topik (belum mulai, sedang dipelajari, selesai) beserta target tanggal.
- **Catatan**: tulis materi yang sudah dipelajari dengan Markdown + rumus LaTeX (`$x^2$`, `$$…$$`), tabel, dan blok kode. Catatan bisa dihubungkan ke subjek/topik dan diberi tag. Tersedia pencarian dan filter.
- **Sumber Belajar**: simpan link YouTube (judul dan thumbnail diambil otomatis), artikel, kursus, atau upload dokumen (PDF, slide, notebook) ke Supabase Storage.
- **Laporan Mingguan**: Weekly Progress sesuai template Guidebook Mentee IS Lab (4 pertanyaan Learning Progress + 4 poin Project Progress untuk weekly meeting). Nomor Week dihitung otomatis dari timeline program, isian bisa diambil otomatis dari aktivitas minggu itu, lalu bisa diekspor ke **PDF** dan **Word (.docx)**, disalin dalam format chat WhatsApp, atau dibagikan lewat **link publik** (tanpa login, bisa dimatikan kapan saja).
- **Dashboard**: ringkasan progres, topik yang sedang dipelajari, target yang terlambat, catatan terbaru, antrian belajar, dan pengingat laporan minggu ini.
- **Login wajib**: semua halaman terkunci. Pendaftaran publik dimatikan, jadi akun hanya dibuat lewat dashboard Supabase.

Stack: Next.js 16 (App Router, Server Actions) · Supabase (Postgres + Auth + Storage, dengan Row Level Security) · Tailwind CSS v4 · siap di-deploy ke Vercel.

---

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. **Buat tabel dan aturan keamanan**: buka **SQL Editor → New query**, salin seluruh isi [`supabase/schema.sql`](supabase/schema.sql), lalu klik **Run**. Script ini membuat:
   - tabel `subjects`, `syllabus_items`, `notes`, `resources`
   - trigger `updated_at` dan `completed_at` otomatis
   - Row Level Security (setiap user hanya bisa mengakses datanya sendiri)
   - bucket Storage privat `documents` beserta policy-nya
3. **Tambahkan fitur Laporan Mingguan**: buat query baru di SQL Editor, tempel isi [`supabase/002_weekly_reports.sql`](supabase/002_weekly_reports.sql), lalu **Run**. Script ini membuat tabel `profiles` dan `weekly_reports`, plus fungsi `get_shared_report` yang dipakai link berbagi.
4. **Matikan pendaftaran publik**: **Authentication → Sign In / Providers**, lalu matikan **Allow new users to sign up**.
5. **Buat akunmu**: **Authentication → Users → Add user → Create new user**. Isi email dan password, lalu centang **Auto Confirm User**.
6. **Ambil API key**: di **Project Settings → API Keys** (atau **Data API**), salin:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Key "anon" versi lama juga bisa dipakai.

> Jangan pernah memakai `service_role` / secret key di aplikasi ini. Semua akses sudah dijaga oleh RLS.

## 2. Menjalankan di lokal

```bash
npm install
cp .env.example .env.local   # lalu isi nilainya
npm run dev
```

Buka http://localhost:3000, lalu login dengan akun yang dibuat di langkah 1.5.

## 3. Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di Vercel: **Add New → Project**, lalu import repo tersebut. Framework akan terdeteksi otomatis sebagai Next.js.
3. Tambahkan **Environment Variables** yang sama dengan `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan opsional `NEXT_PUBLIC_TIMEZONE`.
4. Deploy. Setelah itu, di Supabase **Authentication → URL Configuration**, isi **Site URL** dengan domain Vercel-mu.

### Region (penting untuk kecepatan)

Server Vercel harus berada **di region yang sama dengan database Supabase**, karena setiap halaman menjalankan beberapa query. [`vercel.json`](vercel.json) sudah mengatur region function ke `syd1` (Sydney), sesuai project Supabase saat ini (`ap-southeast-2`). Kalau nanti kamu pindah ke project Supabase di region lain, ganti nilainya juga:

| Supabase | Vercel |
|---|---|
| Singapore `ap-southeast-1` | `sin1` |
| Sydney `ap-southeast-2` | `syd1` |
| Tokyo `ap-northeast-1` | `hnd1` |

## Catatan performa

- Mode `npm run dev` memang lebih lambat: setiap halaman di-compile saat pertama dibuka, dan prefetch dimatikan. Untuk merasakan kecepatan aslinya, jalankan `npm run build` lalu `npm start`.
- Menu utama di-prefetch penuh, dan halaman yang sudah dikunjungi di-cache di browser (`staleTimes` di `next.config.ts`). Setiap perubahan data otomatis mengosongkan cache ini.
- Tab di halaman subjek, filter Sumber Belajar, dan pencarian Catatan berjalan di browser tanpa request ke server.

## Struktur proyek

```
supabase/schema.sql        ← skema database utama (jalankan sekali di SQL Editor)
supabase/002_weekly_reports.sql ← tabel laporan mingguan + fungsi link berbagi
src/proxy.ts               ← gerbang login (refresh sesi + redirect ke /login)
src/lib/supabase/          ← client Supabase untuk server, browser, dan proxy
src/lib/actions/           ← Server Actions (create/update/delete)
src/app/login/             ← halaman login
src/app/(app)/             ← halaman yang butuh login: dashboard, subjects, notes, resources, reports
src/app/r/[token]/         ← halaman publik laporan yang dibagikan (tanpa login)
src/lib/report-template.ts ← template Weekly Progress (pertanyaan guidebook, hitungan Week)
src/lib/report-docx.ts     ← pembuat file Word (.docx) dari laporan
src/app/api/files/         ← membuka file upload lewat signed URL
src/components/            ← komponen UI
```

## Rencana mobile app

Semua logika data ada di Supabase, jadi mobile app (Expo/React Native atau Flutter) nanti cukup:

- memakai project Supabase yang sama dengan `supabase-js` / `supabase_flutter` dan login dengan akun yang sama;
- membaca dan menulis tabel yang sama. RLS dan `user_id default auth.uid()` otomatis membatasi data per user, jadi client tidak perlu mengirim `user_id`;
- sinkronisasi inkremental memakai kolom `updated_at` (`select … where updated_at > last_sync`), atau Supabase Realtime (aktifkan di **Database → Publications**) untuk update langsung;
- ID berupa UUID, jadi data yang dibuat offline di HP tidak bentrok dengan data dari web.

Satu hal yang perlu ditambahkan nanti kalau mau offline sync penuh: kolom `deleted_at` (soft delete), supaya penghapusan di satu perangkat juga terdeteksi di perangkat lain.

Tipe TypeScript bisa di-generate otomatis dari skema dengan:

```bash
npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```
