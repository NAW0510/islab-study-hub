@AGENTS.md
## Proyek
- Konteks proyek: docs/PROJECT_CONTEXT.md
- Spesifikasi fitur Kosakata, Peta Otak, dan redesign UI: docs/SPEC_KOSAKATA_PETA_OTAK.md
- Kerjakan per fase sesuai §10 di spec dan ikuti aturan §0. Jangan jalankan migrasi atau deploy ke Supabase remote tanpa konfirmasiku.

## Status
- Fase 0 (pengaman dan fondasi) dan Fase 1 (design system dan shell) selesai dan sudah ada di `main`.
- Fase 2 (Kosakata MVP) selesai dan sudah di `main`: migrasi + fungsi `vocab-embed` ter-deploy di Supabase remote, 8/8 uji penerimaan lulus (7/7 kasus klasifikasi benar dengan Voyage asli — docs/VOCAB_CALIBRATION.md). Ambang klasifikasi masih nilai awal; kalibrasi setelah ±30 istilah nyata.
- Fase 3 (Peta Otak 2D) selesai dan sudah di `main` (PR #5): migrasi `vocab_map` dan `vocab-embed` v2 (penempatan kNN) di remote, QA di data asli oke.
- Peta Otak 3D (`/vocab/map/3d`: Luar angkasa · Otak · Kubus, branch `feat/peta-otak-3d`) selesai; menunggu QA dan merge. Visualisasi 3D baru = satu `ViewScene` + satu entri di `src/components/vocab/map/scenes/registry.ts`.
- Bentuk otak dari model "Brain" karya dgallichan (CC BY 4.0); kredit wajib tetap tampil di app dan README.
- Data uji peta lokal: `node scripts/seed-local-vocab.mjs --reset` (akun dev lokal saja).

## Catatan kerja
- Sistem desain: docs/DESIGN_SYSTEM.md. Pakai token dan kelas yang ada di sana; jangan menulis warna Tailwind langsung (mis. `bg-amber-100`).
- Konvensi Week: Senin–Minggu, Week 1 mulai 28 Sep 2026. Hitung lewat helper di `src/lib/report-template.ts`.
- Sebelum commit: `npm run lint`, `npm test`, `npm run build`; untuk perubahan database juga `npm run test:db` (butuh `npx supabase start`).
- Uji fitur melawan stack lokal dengan `npm run dev:local` (port 3100), bukan akun asli.