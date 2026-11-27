@AGENTS.md
## Proyek
- Konteks proyek: docs/PROJECT_CONTEXT.md
- Spesifikasi fitur Kosakata, Peta Otak, dan redesign UI: docs/SPEC_KOSAKATA_PETA_OTAK.md
- Spesifikasi Ruang Studi (Istilah Teknis, Bahasa, atlas): docs/SPEC_RUANG_STUDI.md
- Kerjakan per fase sesuai §10 di spec dan ikuti aturan §0. Jangan jalankan migrasi atau deploy ke Supabase remote tanpa konfirmasiku.

## Status
- Fase 0 (pengaman dan fondasi) dan Fase 1 (design system dan shell) selesai dan sudah ada di `main`.
- Fase 2 (Kosakata MVP) selesai dan sudah di `main`: migrasi + fungsi `vocab-embed` ter-deploy di Supabase remote, 8/8 uji penerimaan lulus (7/7 kasus klasifikasi benar dengan Voyage asli — docs/VOCAB_CALIBRATION.md). Ambang klasifikasi masih nilai awal; kalibrasi setelah ±30 istilah nyata.
- Fase 3 (Peta Otak 2D) selesai dan sudah di `main` (PR #5): migrasi `vocab_map` dan `vocab-embed` v2 (penempatan kNN) di remote, QA di data asli oke.
- Peta Otak 3D (`/vocab/map/3d`: Luar angkasa · Otak · Kubus) selesai dan sudah di `main` (PR #6). Visualisasi 3D baru = satu `ViewScene` + satu entri di `src/components/vocab/map/scenes/registry.ts`.
- Next.js dan `eslint-config-next` di 16.4.5 (PR #4); zod (dev) di 4.6.6 (PR #7).
- Fase 4 (integrasi §9, tampilan Kartu, restyle halaman sisa) selesai dan sudah di `main` (PR #8, #9). Tautan langsung Kosakata: `/vocab?term=<id>` (buka detail), `/vocab?topic=<id>`, `/vocab?view=kartu`.
- Perpustakaan (`/vocab/perpustakaan`, dunia WebGL ala Articles MGM: rak bidang → ruang bidang → halaman istilah + "Istilah berikutnya") sudah di `main` (PR #10). Pola dan penyetelan: docs/DESIGN_SYSTEM.md › Pola Perpustakaan.
- Restyle Bauhaus (arah labmgm.org) untuk semua halaman sudah di `main` (PR #11). Aturan transisi "tak terasa" dan petanya: docs/DESIGN_SYSTEM.md › Gerak dan transisi.
- Istilah multi-domain (domain utama + `vocab_term_domains`, saran "Juga cocok di"), irisan di keempat peta, dan Peta Otak layar penuh dengan intro sudah di `main` (PR #12). Migrasi `20261118120000_vocab_multi_domain.sql` sudah diterapkan di remote (tanpa redeploy fungsi); kelima migrasi sinkron. Pola: docs/DESIGN_SYSTEM.md › Istilah multi-domain, Peta Otak layar penuh, Intro Peta Otak.
- Navbar atas menggantikan sidebar, sudah di `main` (PR #13): baris kedua untuk sub-tab dan sakelar tampilan (dari rute lewat `subNavFor`, atau dari halaman lewat `NavSlot`; alat Peta Otak di ujung kanan lewat `NavSlot place="end"`), dan masuk/keluar Perpustakaan tanpa sambungan. Navbar tidak boleh bergeser antarhalaman (QA mengukurnya). Pola: docs/DESIGN_SYSTEM.md › Gerak dan transisi, Sub-tab, Pola Perpustakaan.
- Ruang Studi di branch `feat/ruang-studi`: menu 04 menggantikan Kosakata (`/studi`, langsung Perpustakaan dengan rak buku); Kosakata menjadi **Istilah Teknis** di `/studi/istilah` (+ `/peta`, `/peta/3d`, `/domain`), rute `/vocab*` lama dialihkan; halaman **Bahasa** (`/studi/bahasa`, tabel `study_languages`/`study_words`); buku Bahasa di Perpustakaan membuka atlas hologram (`src/components/study/atlas/`, angka di `src/lib/study/atlas/config.ts`). Migrasi `20261127120000_study_languages.sql` baru di stack lokal; `db push` remote menunggu konfirmasi Ngurah (tanpa fungsi). Data uji: `node scripts/seed-local-study.mjs --reset`. Pola: docs/DESIGN_SYSTEM.md › Pola atlas Bahasa.
- Data peta atlas dari Natural Earth (public domain); kredit tampil di atlas dan README. Bangun ulang: `node scripts/build-atlas.mjs <ne_50m_admin_0_countries.geojson>`.
- Berikutnya: Fase 5 (eksplorasi, opsional, §10). Tampilan 3D sudah ada; butir lain dipilih nanti. Kalibrasi ambang klasifikasi tetap menunggu ±30 istilah nyata.
- Bentuk otak dari model "Brain" karya dgallichan (CC BY 4.0); kredit wajib tetap tampil di app dan README.
- Data uji peta lokal: `node scripts/seed-local-vocab.mjs --reset` (akun dev lokal saja).

## Catatan kerja
- Sistem desain: docs/DESIGN_SYSTEM.md. Pakai token dan kelas yang ada di sana; jangan menulis warna Tailwind langsung (mis. `bg-amber-100`).
- Konvensi Week: Senin–Minggu, Week 1 mulai 28 Sep 2026. Hitung lewat helper di `src/lib/report-template.ts`.
- Sebelum commit: `npm run lint`, `npm test`, `npm run build`; untuk perubahan database juga `npm run test:db` (butuh `npx supabase start`).
- Uji fitur melawan stack lokal dengan `npm run dev:local` (port 3100), bukan akun asli.