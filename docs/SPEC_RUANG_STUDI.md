# Spesifikasi: Ruang Studi, Istilah Teknis, dan Bahasa

Status: Tahap 1–4 selesai dan sudah di `main` (PR #15, 28 Nov 2026); migrasi sudah diterapkan di remote. Melengkapi docs/SPEC_KOSAKATA_PETA_OTAK.md; aturan §0 di sana tetap berlaku. Pola desain yang jadi: docs/DESIGN_SYSTEM.md › Pola atlas Bahasa.

**Beda dari rencana**: buku Istilah Teknis tetap memakai transisi sapuan Perpustakaan (bukan animasi buku); animasi buku hanya untuk Bahasa, seperti yang diminta. Bisa ditambahkan nanti dengan mesin buku yang sama.

## 0. Ringkasan

- **Ruang Studi** (`/studi`) menggantikan menu Kosakata di navbar. Begitu dibuka, kamu langsung berada di **Perpustakaan**.
- Perpustakaan sekarang berisi **buku**:
  - **Istilah Teknis**: isi Kosakata yang lama (rak bidang → ruang bidang → halaman istilah).
  - **Bahasa**: diksi bahasa yang kamu pelajari.
- Menekan buku memutar **animasi buku terbuka**. Buku Bahasa membuka **hologram peta dunia**. Menekan sebuah negara membuat kamera fokus dan mendekat ke negara itu, lalu menampilkan diksi yang sudah kamu pelajari di sana.
- Halaman Kosakata berganti nama menjadi **Istilah Teknis** dan pindah ke dalam Ruang Studi (Daftar · Peta Otak · Domain).
- Halaman baru **Bahasa** untuk mengelola diksi dan daftar bahasa. Di dalam buku ada juga "Tambah diksi" cepat.

Keputusan Ngurah (27 Nov):
- semua masuk ke dalam Ruang Studi (navbar tetap enam link);
- halaman Bahasa + tambah cepat di buku;
- bahasa bawaan yang negaranya bisa diubah, dan diksi bisa ditandai khas satu negara;
- data peta Natural Earth 50m.

## 1. Navigasi dan rute

Navbar: 01 Dashboard · 02 Subjek · 03 Catatan · **04 Ruang Studi** · 05 Sumber · 06 Laporan. Bentuk dan warnanya mewarisi Kosakata (plus, kuning).

| Rute | Isi | Dulu |
|---|---|---|
| `/studi` | Perpustakaan: rak buku; `?buku=istilah` (+ `bidang`, `istilah`, `q`, `domain`); `?buku=bahasa` (+ `negara=JP`) | `/vocab/perpustakaan` |
| `/studi/istilah` | Istilah Teknis › Daftar (`?term=`, `?topic=`, `?view=kartu` tetap) | `/vocab` |
| `/studi/istilah/peta`, `/studi/istilah/peta/3d` | Istilah Teknis › Peta Otak 2D/3D | `/vocab/map`, `/vocab/map/3d` |
| `/studi/istilah/domain` | Istilah Teknis › Domain | `/vocab/domains` |
| `/studi/bahasa` | Bahasa: daftar diksi + kelola bahasa (`?bahasa=<id>`, `?q=`) | (baru) |

- **Rute lama dialihkan** di `next.config.ts` (307; query ikut). `/vocab/perpustakaan` → `/studi?buku=istilah`. Tautan dari Catatan, Subjek, Dashboard, dan Laporan langsung ditulis ke rute baru.
- **Baris kedua navbar** (`subNavFor`):
  - di semua halaman Ruang Studi: **Perpustakaan · Istilah Teknis · Bahasa**;
  - di halaman Istilah Teknis ditambah **Daftar · Peta Otak · Domain**, dan di Peta Otak ditambah **2D | 3D**;
  - sakelar halaman (Daftar/Kartu, tampilan 3D, alat peta) tetap lewat `NavSlot`;
  - bila baris terlalu padat, label tingkat pertama menyusut jadi ikon (pola `ResponsiveLabel`).
- **Imersif** (navbar hampir bening): `/studi` dan `/studi/istilah/peta*`.
- **Teks UI**: "Kosakata" menjadi "Istilah Teknis" di semua tempat (judul, keadaan kosong, tautan terkait). Kode dan tabel tetap bernama `vocab_*`.

## 2. Perpustakaan dengan buku

**Tingkat**: rak buku → (Istilah Teknis) rak bidang → ruang bidang → halaman istilah, atau (Bahasa) atlas → negara. Semuanya tetap satu halaman, jadi dunia WebGL hidup terus antartingkat.

**Rak buku**: dua lembar bersampul Bauhaus.
- Istilah Teknis: "n istilah · m bidang".
- Bahasa: "n diksi · m bahasa".

**Membuka buku** (`book-opening`, lapisan three.js di atas dunia):
1. Sampul terangkat dari tempat lembarnya di rak. Lembar di dunia disembunyikan supaya tidak terlihat dobel.
2. Buku berputar dan merebah ke bawah layar sementara latar kabut menutup perpustakaan.
3. Sampul membuka pada engselnya dan halaman-halamannya bergeser.
4. **Istilah Teknis**: cahaya dari halaman memenuhi layar, lalu rak bidang muncul dari balik cahaya itu.
5. **Bahasa**: berkas cahaya naik dari halaman dan hologram peta tersusun dari bawah ke atas (sapuan pindai). Negara yang punya diksi menyala bergiliran dalam warna bahasanya.

**Menutup** (tombol kembali atau back browser): hologram turun ke halaman, buku menutup, lalu terbang ke tempat lembarnya di rak saat kabut terbuka.

**Aturan transisi** tetap "tak terasa":
- tidak pernah menahan navigasi atau input;
- setiap klik, gulir, atau tombol mempercepat animasi ke ujungnya;
- dengan reduced motion: tanpa animasi buku, langsung ke isinya;
- tanpa WebGL2: atlas DOM/SVG dengan sapuan warna biasa.

## 3. Buku Bahasa: atlas hologram

**Isi DOM** (selalu lengkap, juga untuk pembaca layar dan cadangan):
- kepala "Bahasa" + ringkasan (diksi, bahasa, negara);
- peta SVG datar (tampil bila hologram tidak jalan);
- daftar negara yang punya diksi, sebagai tombol yang bisa dipakai dengan keyboard;
- panel negara terpilih.

**Hologram** (three.js, bila perangkat mampu dan tanpa reduced motion):
- **Bentuk**:
  - peta proyeksi ekuirektangular yang melayang miring di atas buku terbuka;
  - isi negara tembus pandang;
  - garis batas yang bercahaya;
  - graticule tipis;
  - garis pindai yang bergerak, kedip halus, dan tepi yang memudar;
  - kerucut cahaya dari halaman ke peta dengan debu cahaya.
- **Warna**:
  - warna dasar dari token `--holo`;
  - negara berdiksi memakai warna bahasanya (palet `--domain-*`, sama dengan bidang);
  - di mode gelap campurannya aditif, di mode terang campuran biasa supaya tetap terbaca di kertas.
- **Hover**: negara di bawah kursor menebal, dan namanya muncul di label kecil yang mengikuti kursor.
- **Pilih negara** (klik, daftar, atau `?negara=`):
  - kamera terbang (±1,2 detik) membingkai negara itu. Kotak fokusnya dari pulau-pulau utama, jadi Prancis tanpa Guyana dan AS tanpa Alaska;
  - negara lain meredup, dan pin cahaya naik di titik labelnya;
  - panel muncul dengan bahasa-bahasa negara itu dan diksinya: kata, cara baca, arti, dan Week;
  - tombol kembali atau Esc mengembalikan ke peta penuh.
- Kamera condong mengikuti kursor seperti di Perpustakaan, dan peta mengambang pelan.
- Semua angka (waktu, jarak kamera, warna campuran, ambang ukuran) ada di `src/lib/study/atlas/config.ts`.

**Pemetaan negara**:
- bahasa punya daftar negara (ISO 3166-1 alpha-2);
- diksi tanpa negara khas tampil di semua negara bahasanya;
- diksi dengan negara khas hanya tampil di negara itu.

**Tambah cepat di panel**: bahasa (pilihan dari bahasa negara itu), kata, cara baca, arti, dan "khas negara ini". Negara yang belum punya bahasa mendapat tautan "Tambah bahasa untuk negara ini" ke halaman Bahasa.

**Data peta**:
- **Sumber**: Natural Earth 1:50m Admin 0 Countries (public domain), diunduh sekali dengan izin Ngurah.
- **Skrip** `scripts/build-atlas.mjs`:
  - menyederhanakan (Douglas–Peucker) dan mengkuantisasi koordinat;
  - menggabungkan Somaliland ke Somalia dan Siprus Utara ke Siprus, serta membuang Antartika dan Gletser Siachen;
  - menghitung titik label dan kotak fokus;
  - menulis `src/lib/study/atlas/countries.json` (dimuat hanya saat buku Bahasa dibuka) dan `src/lib/study/atlas/country-names.ts` (kode → nama Indonesia dari `NAME_ID`, untuk pemilih negara).
- Kredit Natural Earth tampil di panel info atlas dan README.

## 4. Halaman Bahasa (`/studi/bahasa`)

- **Kepala**: judul, ringkasan, dan "Tambah diksi". Di baris kedua navbar ada filter bahasa lewat `NavSlot` (Semua · Jepang 12 · Inggris 4 …), dan cari ada di halaman.
- **Tambah diksi**:
  - bahasa, kata, cara baca, arti;
  - opsional: contoh kalimat, catatan, khas negara, tanggal belajar (default hari ini, ditampilkan sebagai Week).
  - Arti ditulis sendiri; tidak ada terjemahan otomatis (§0).
- **Daftar**:
  - setiap kartu berisi kata (besar), cara baca, arti, contoh, chip negara khas, dan Week;
  - ubah lewat dialog;
  - hapus dengan soft delete, plus "Urungkan" seperti di Istilah Teknis.
- **Kelola bahasa** (dialog):
  - tambah dari daftar bawaan (Jepang, Inggris, Korea, Mandarin, Arab, Jerman, Prancis, Spanyol, Portugis, Belanda, Rusia, Italia, Thai, Vietnam, Melayu, Hindi, Turki, Tagalog, Persia, Swahili, Indonesia) atau buat sendiri (mis. Bahasa Bali → Indonesia);
  - ubah nama, warna, dan negara (daftar centang yang bisa dicari);
  - hapus hanya bila tidak ada diksi aktif.
- **Keadaan kosong**: ajakan memilih bahasa pertama dari daftar bawaan.

## 5. Database (migrasi `…_study_languages.sql`)

Polanya sama dengan tabel lain:
- `id uuid`, `user_id default auth.uid()`, `updated_at` otomatis, soft delete `deleted_at`;
- RLS hanya pemilik; `anon` tanpa akses.

```
study_languages
  name text (1–60, unik per pengguna di antara yang aktif)
  code text null (ISO 639, mis. ja, en, ban)
  countries text[] (alpha-2 huruf besar, ≤ 60)
  color text (domain-1 … domain-10)

study_words
  language_id uuid → study_languages (milik pengguna yang sama, masih aktif; dijaga trigger)
  word text (1–200, unik per bahasa di antara yang aktif)
  reading text null (≤ 200)
  meaning text (≤ 2000)
  example text null (≤ 2000)
  notes text null (≤ 4000)
  region text null (alpha-2)
  learned_on date (default hari ini)
```

- Uji pgTAP baru: `supabase/tests/study.test.sql` (RLS dua akun, trigger bahasa milik orang lain, unik, soft delete).
- Diterapkan di remote pada 28 Nov 2026 atas konfirmasi Ngurah. Tidak ada fungsi yang perlu di-deploy.

## 6. Tahap kerja

1. **Ruang Studi**:
   - rute pindah + pengalihan;
   - navbar dan baris kedua;
   - ganti nama Istilah Teknis;
   - Perpustakaan dengan rak buku; buku Bahasa sementara mengarah ke halaman Bahasa.
2. **Data Bahasa**: migrasi + uji DB, tipe, actions, daftar bawaan, halaman Bahasa.
3. **Atlas**: skrip data peta, atlas DOM/SVG + panel + tambah cepat, hologram dan animasi buku, integrasi Perpustakaan (jeda dunia saat atlas menutupi layar).
4. **Penutup**: animasi buku untuk Istilah Teknis, dokumen (DESIGN_SYSTEM › Pola Ruang Studi, PROJECT_CONTEXT, CLAUDE.md, README), `/dev/design`, QA, dan laporan.

**Selesai bila**:
- semua rute lama mengalihkan dengan benar;
- navbar tidak bergeser;
- diksi bisa ditambah, diubah, dan dihapus;
- RLS lulus untuk dua akun;
- buku membuka mulus di GPU dan SwiftShader; atlas DOM jalan tanpa WebGL dan dengan reduced motion;
- fokus negara membingkai negara yang benar (Jepang, Indonesia, Prancis, AS, Singapura);
- `npm run lint`, `npm test`, `npm run build`, dan `npm run test:db` lulus;
- ukuran JS rute lain tidak bertambah berarti (data peta dan hologram dimuat belakangan).
