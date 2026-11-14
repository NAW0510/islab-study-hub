@AGENTS.md
## Proyek
- Konteks proyek: docs/PROJECT_CONTEXT.md
- Spesifikasi fitur Kosakata, Peta Otak, dan redesign UI: docs/SPEC_KOSAKATA_PETA_OTAK.md
- Kerjakan per fase sesuai §10 di spec dan ikuti aturan §0. Jangan jalankan migrasi atau deploy ke Supabase remote tanpa konfirmasiku.

## Status
- Fase 0 (pengaman dan fondasi) dan Fase 1 (design system dan shell) selesai dan sudah ada di `main`.
- Berikutnya: Fase 2 (Kosakata MVP). Belum dimulai.

## Catatan kerja
- Sistem desain: docs/DESIGN_SYSTEM.md. Pakai token dan kelas yang ada di sana; jangan menulis warna Tailwind langsung (mis. `bg-amber-100`).
- Konvensi Week: Senin–Minggu, Week 1 mulai 28 Sep 2026. Hitung lewat helper di `src/lib/report-template.ts`.
- Sebelum commit: `npm run lint`, `npm test`, `npm run build`.