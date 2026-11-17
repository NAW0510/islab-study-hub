# IS Lab Study Hub

Platform pribadi untuk mencatat perjalanan belajar Machine Learning & Data Science di IS Lab:

- **Subjek & Silabus**: kelompokkan materi per bidang, tempel silabus (satu topik per baris), lalu tandai progres per topik (belum mulai, sedang dipelajari, selesai) beserta target tanggal.
- **Kosakata**: glosarium pribadi istilah teknis (`/vocab`). Kamu menulis istilah + definisinya sendiri; sistem meng-embed teksnya (Voyage AI, lewat Edge Function `vocab-embed`) lalu menebak bidang/cabang ilmunya. Tebakan bisa dikonfirmasi atau diubah, dan pilihanmu tidak pernah ditimpa. Mendukung tempel banyak (satu istilah per baris), pencarian instan, dan istilah terdekat berdasarkan makna.
- **Peta Otak**: semua istilah Kosakata sebagai satu peta (`/vocab/map`). Istilah yang maknanya dekat letaknya berdekatan, tiap bidang punya wilayah, dan slider Week memutar ulang bagaimana peta tumbuh. Tata letaknya (UMAP) dihitung di browser saat kamu menekan "Susun ulang"; istilah baru langsung ditaruh dekat istilah sejenis tanpa menyusun ulang.
- **Peta Otak 3D** (`/vocab/map/3d`, sakelar **2D · 3D**): istilah yang sama dalam tiga tampilan yang bisa diputar.
  - **Luar angkasa**: tiap bidang sebuah galaksi dengan lubang hitam, tiap cabang sebuah matahari; istilah menjadi planet, bulan, atau batuan menurut perannya, lengkap dengan orbitnya.
  - **Otak**: bentuk otak sungguhan dari neuron, di mana tiap istilah menyalakan satu neuron di lobus bidangnya.
  - **Kubus**: titik di ruang makna 3D.
- **Catatan**: tulis materi yang sudah dipelajari dengan Markdown + rumus LaTeX (`$x^2$`, `$$…$$`), tabel, dan blok kode. Catatan bisa dihubungkan ke subjek/topik dan diberi tag. Tersedia pencarian dan filter.
- **Sumber Belajar**: simpan link YouTube (judul dan thumbnail diambil otomatis), artikel, kursus, atau upload dokumen (PDF, slide, notebook) ke Supabase Storage.
- **Laporan Mingguan**: Weekly Progress sesuai template Guidebook Mentee IS Lab (4 pertanyaan Learning Progress + 4 poin Project Progress untuk weekly meeting). Nomor Week dihitung otomatis dari timeline program, isian bisa diambil otomatis dari aktivitas minggu itu, lalu bisa diekspor ke **PDF** dan **Word (.docx)**, disalin dalam format chat WhatsApp, atau dibagikan lewat **link publik** (tanpa login, bisa dimatikan kapan saja).
- **Dashboard**: ringkasan progres, topik yang sedang dipelajari, target yang terlambat, catatan terbaru, antrian belajar, dan pengingat laporan minggu ini.
- **Login wajib**: semua halaman terkunci. Pendaftaran publik dimatikan, jadi akun hanya dibuat lewat dashboard Supabase.

Stack: Next.js 16 (App Router, Server Actions) · Supabase (Postgres + Auth + Storage, dengan Row Level Security) · Tailwind CSS v4 · siap di-deploy ke Vercel.

---

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. **Buat tabel dan aturan keamanan**: semua skema ada di [`supabase/migrations/`](supabase/migrations), dijalankan berurutan sesuai nama file:
   - [`20261113000000_initial_schema.sql`](supabase/migrations/20261113000000_initial_schema.sql): tabel `subjects`, `syllabus_items`, `notes`, `resources`; trigger `updated_at` dan `completed_at`; Row Level Security (setiap user hanya bisa mengakses datanya sendiri); bucket Storage privat `documents` beserta policy-nya.
   - [`20261113000100_weekly_reports.sql`](supabase/migrations/20261113000100_weekly_reports.sql): tabel `profiles` dan `weekly_reports`, plus fungsi `get_shared_report` yang dipakai link berbagi.

   Untuk project baru: `npx supabase login`, `npx supabase link --project-ref <ref>`, lalu `npx supabase db push`. Atau tempel isi kedua file berurutan di **SQL Editor** lalu tandai sudah diterapkan (lihat [Mengubah database](#mengubah-database-migrasi)).
3. **Matikan pendaftaran publik**: **Authentication → Sign In / Providers**, lalu matikan **Allow new users to sign up**.
4. **Buat akunmu**: **Authentication → Users → Add user → Create new user**. Isi email dan password, lalu centang **Auto Confirm User**.
5. **Ambil API key**: di **Project Settings → API Keys** (atau **Data API**), salin:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Key "anon" versi lama juga bisa dipakai.

> Jangan pernah memakai `service_role` / secret key di aplikasi ini. Semua akses sudah dijaga oleh RLS.

## 2. Menjalankan di lokal

```bash
npm install
cp .env.example .env.local   # lalu isi nilainya
npm run dev
```

Buka http://localhost:3000, lalu login dengan akun yang dibuat di langkah 1.4.

### Test dan pengecekan

```bash
npm test          # unit test (Vitest), sekali jalan
npm run test:watch
npm run lint
npm run build
```

Test ditaruh di samping file yang dites, dengan akhiran `.test.ts` (contoh: `src/lib/report-template.test.ts`).

### Kosakata: API key Voyage

Fitur Kosakata butuh API key [Voyage AI](https://dashboard.voyageai.com) (ada kuota gratis yang besar).
Key ini **hanya** disimpan sebagai secret Edge Function — jangan pernah menaruhnya di `.env.local`:

```bash
npx supabase secrets set VOYAGE_API_KEY=key-kamu
```

Deploy fungsinya dengan `npx supabase functions deploy vocab-embed`. Tanpa key yang benar, istilah tetap
tersimpan sebagai "belum diproses" dan bisa diproses ulang dari halaman Kosakata.

### Pengembangan melawan stack lokal

```bash
npx supabase start
```

```bash
npm run dev:local
```

`npm run dev:local` menjalankan app di port 3100 melawan Supabase lokal (akun dev lokal dibuat otomatis;
kredensialnya ada di `scripts/local-stack.mjs`), jadi data aslimu tidak tersentuh. Edge Function lokal:
`npx supabase functions serve --env-file supabase/functions/.env` (salin dari `.env.example`; bisa menunjuk
server tiruan `node scripts/voyage-mock.mjs`). Test database: `npm run test:db` (pgTAP).

Untuk mencoba Peta Otak dengan jumlah istilah yang realistis, isi stack lokal dengan ±300 istilah sintetis
berkelompok (butuh `functions serve` dan server tiruan di atas; hanya menyentuh akun dev lokal):

```bash
node scripts/seed-local-vocab.mjs --reset
```

## Mengubah database (migrasi)

Skema dikelola dengan Supabase CLI (dipasang sebagai devDependency, jalankan lewat `npx supabase`). Project lokal sudah di-link ke project Supabase; sekali per komputer jalankan `npx supabase login` lalu `npx supabase link --project-ref <ref>`.

1. **Backup dulu** sebelum mengubah database remote: `npx supabase db dump --linked -f <folder-di-luar-repo>/schema.sql` (tambah `--data-only --use-copy` untuk data). Butuh Docker Desktop yang sedang berjalan.
2. Buat file migrasi baru: `npx supabase migration new <nama>`, lalu tulis SQL-nya di file yang muncul di `supabase/migrations/`.
3. Cek status: `npx supabase migration list --linked`.
4. Terapkan ke remote **hanya setelah direview**: `npx supabase db push --linked`.
5. Perbarui tipe TypeScript: `npm run db:types` (menulis `src/lib/supabase/database.types.ts`).

Jangan mengubah file migrasi yang sudah diterapkan; buat migrasi baru. Kalau SQL terlanjur dijalankan manual di SQL Editor, tandai dengan `npx supabase migration repair --status applied <versi> --linked` supaya riwayatnya tetap sinkron.

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
supabase/migrations/       ← migrasi database (urut sesuai timestamp di nama file)
supabase/config.toml       ← konfigurasi Supabase CLI
src/proxy.ts               ← gerbang login (refresh sesi + redirect ke /login)
src/lib/supabase/          ← client Supabase untuk server, browser, dan proxy
src/lib/supabase/database.types.ts ← tipe hasil `npm run db:types` (jangan diedit manual)
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

Tipe TypeScript di-generate otomatis dari skema dengan `npm run db:types`.

## Kredit

Bentuk otak di Peta Otak 3D (tampilan **Otak**) berasal dari model 3D
["Brain"](https://sketchfab.com/3d-models/brain-cadd2bde67404c43b2359a6a3281d84a) karya
[dgallichan](https://sketchfab.com/dgallichan), dengan lisensi
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modelnya disederhanakan menjadi 5.000 titik di
permukaan luarnya (`src/lib/vocab/brain-points.ts`, dibuat dengan `scripts/bake-brain-points.mjs`);
berkas mesh-nya sendiri tidak disertakan di repo ini.
