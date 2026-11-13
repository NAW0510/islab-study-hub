# Spesifikasi: Kosakata, Peta Otak, dan Penyegaran UI — IS Lab Study Hub

> Dokumen ini melengkapi `PROJECT_CONTEXT.md`. Baca keduanya sebelum mulai.
> Status: siap dikerjakan per fase. Keputusan yang masih terbuka ada di §12, masing-masing sudah punya nilai default.

---

## 0. Aturan main untuk Claude Code

1. **Kerjakan per fase (§10), bukan sekaligus.** Di awal tiap fase: masuk plan mode, rangkum rencana dan daftar file yang akan diubah, lalu tunggu persetujuan Ngurah. Di akhir tiap fase: `npm run build`, jalankan test, commit dengan pesan yang jelas, dan berikan checklist QA manual.
2. **Prinsip lama tetap berlaku**: tidak ada `service_role` key di mana pun (termasuk Edge Function), semua tabel baru pakai RLS owner-only dan tanpa akses `anon`, tetap di free tier Supabase + Vercel, UI berbahasa Indonesia, template laporan guidebook tidak berubah, logika data sebisa mungkin di Supabase.
3. **Jangan jalankan migrasi atau `supabase functions deploy` ke project remote tanpa konfirmasi eksplisit.** Buat dump database dulu sebelum migrasi pertama.
4. **Verifikasi API pihak ketiga ke dokumentasi terbaru** (Supabase Edge Runtime, Voyage AI, umap-js, Next.js 16). Dokumen ini menjelaskan perilaku yang diinginkan; nama fungsi dan parameter pihak ketiga yang disebut di sini perlu dicek ulang.
5. **Bagian ML (skor klasifikasi, ambang keputusan, parameter UMAP)**: jelaskan alasan setiap pilihan secara singkat dan letakkan semua angka di satu file konfigurasi. Ngurah ingin memahami dan mengkalibrasi bagian ini sendiri.
6. Definisi istilah **ditulis sendiri oleh Ngurah**. Sistem hanya mengklasifikasi dan memetakan; jangan menambahkan fitur yang membuat definisi otomatis.

---

## 1. Ringkasan

Tiga pekerjaan:

| | Apa | Nilai bagi Ngurah |
|---|---|---|
| **A. Kosakata** (`/vocab`) | Glosarium pribadi istilah teknis. Tambah istilah + definisi, sistem otomatis menebak bidang/cabang ilmunya (mis. *tensor* → Deep Learning › Machine Learning). | Satu tempat untuk semua istilah baru selama program; mengisi bagian "What did you learn" di laporan mingguan. |
| **B. Peta Otak** (`/vocab/map`) | Visualisasi 2D ala *word embedding*: tiap istilah satu titik, istilah yang maknanya dekat letaknya berdekatan, tiap bidang punya wilayah berbatas. Hover menampilkan kapan istilah dipelajari. Slider Week memutar ulang pertumbuhan "otak". | Gambaran visual apa yang sudah dikuasai dan hubungan antarkonsep. |
| **C. Penyegaran UI** | Bahasa visual terinspirasi https://labmgm.org/ (lab saudara di FILKOM UB), diadaptasi untuk aplikasi harian yang harus cepat dan responsif. | Tampilan yang lebih hidup tanpa mengorbankan kecepatan. |

### Istilah yang dipakai di dokumen ini

- **Istilah**: satu kata/frasa teknis beserta definisinya (tabel `vocab_terms`).
- **Domain**: bidang atau cabang ilmu (tabel `vocab_domains`). Maksimal dua tingkat: **bidang** (tanpa induk, mis. Machine Learning) dan **cabang** (punya induk, mis. Deep Learning › Machine Learning).
- **Embedding**: vektor makna dari teks istilah + definisi, dihasilkan model embedding.
- **Layout**: koordinat 2D tiap istilah di Peta Otak, hasil reduksi dimensi dari embedding.

---

## 2. Arsitektur fitur (gambaran besar)

```
Browser (Next.js)                 Supabase                               Voyage AI
─────────────────                 ────────                               ─────────
Form tambah istilah ──Server Action──► insert vocab_terms (RLS)
                     └─functions.invoke('vocab-embed', JWT user)──► Edge Function
                                                                  ├─► POST /embeddings ──► vektor
                                                                  ├─ update embedding (RLS, client user)
                                                                  ├─ rpc suggest_vocab_domains → skor → domain
                                                                  └─ rpc match_vocab_terms → posisi awal di peta
Peta Otak ──rpc vocab_map_points (tanpa vektor, ringan)
"Susun ulang" ──rpc vocab_embeddings ──► Web Worker (umap-js) ──► rpc save_vocab_layout
```

Alasan desain:
- **Embedding di Edge Function**, bukan di Next.js, supaya mobile app nanti memakai backend yang sama.
- **Edge Function dipanggil dengan JWT pengguna**, bukan lewat database webhook. Webhook berjalan tanpa sesi pengguna sehingga butuh `service_role`, yang dilarang.
- **Koordinat peta disimpan di database**, sehingga membuka peta tidak memerlukan komputasi berat dan posisi istilah tidak berubah-ubah setiap kali halaman dibuka.

---

## 3. Fitur A — Kosakata

### 3.1 User stories

1. Saya bisa menambah istilah + definisi (Markdown + LaTeX) dalam beberapa detik dari halaman Kosakata.
2. Setelah disimpan, sistem menebak domainnya. Kalau yakin, langsung terpasang dengan tanda "otomatis". Kalau ragu, saya diminta memilih dari 3 saran teratas.
3. Saya bisa menyetujui tebakan ("Benar") atau mengubahnya. Pilihan saya tidak pernah ditimpa sistem.
4. Saya bisa menempel banyak istilah sekaligus (satu per baris).
5. Saya bisa mencari dan memfilter istilah per domain, mengurutkan berdasarkan tanggal atau abjad.
6. Saya bisa mengelola domain: nama, deskripsi, warna, induk, gabung, hapus.
7. Saya bisa mengaitkan istilah ke subjek, topik silabus, dan catatan yang sudah ada.
8. Istilah yang saya pelajari minggu ini ikut masuk ke draf laporan mingguan.

### 3.2 Alur tambah istilah

1. Isian: **Istilah** (wajib), **Definisi** (dianjurkan minimal satu kalimat; tanpa definisi, klasifikasi jadi lemah dan UI memberi peringatan), opsional: alias (mis. "SGD"), tanggal belajar (default hari ini), kaitan subjek/topik/catatan, domain manual.
2. Server Action `createTerm` meng-insert baris. `domain_source = 'manual'` kalau domain dipilih, selain itu `'pending'`.
3. Action memanggil `supabase.functions.invoke('vocab-embed', { body: { termIds: [id] } })` memakai client server yang membawa sesi pengguna. Timeout 10 detik.
4. UI optimistik: baris baru langsung muncul dengan chip "Mengklasifikasi…", lalu berganti menjadi chip domain.
5. Kalau Edge Function gagal atau timeout: istilah **tetap tersimpan** dengan `embedding = null`, chip "Belum diproses" + tombol "Coba lagi". Ada juga aksi global "Proses yang tertunda".
6. Duplikat (sama dengan istilah atau alias yang sudah ada, tidak peka huruf besar/kecil) diperingatkan sebelum simpan, dengan tautan ke istilah yang sudah ada. Untuk homonim, Ngurah menulis kualifikasi sendiri, mis. "Kernel (SVM)" dan "Kernel (OS)".

### 3.3 Klasifikasi domain

**Teks yang di-embed**
- Istilah: `"{istilah} ({alias, ...}): {definisi}"`. Sintaks Markdown dibuang; isi LaTeX dipertahankan tanpa tanda `$`. Potong di ±1.000 karakter.
- Prototipe domain: `"{nama}: {deskripsi}. Contoh istilah: {hingga 8 istilah berstatus confirmed/manual}"`. Di-embed ulang saat nama/deskripsi berubah, atau saat "Klasifikasi ulang" dijalankan.

**Skor per domain** (semua domain aktif, bidang maupun cabang, ikut bersaing):
- `proto_sim` = kemiripan kosinus embedding istilah dengan prototipe domain.
- `centroid_sim` = kemiripan kosinus dengan rata-rata embedding istilah di domain itu yang berstatus `confirmed`/`manual`. Hanya dihitung kalau anggotanya ≥ `CENTROID_MIN_TERMS` (awal: 3).
- `score = PROTO_WEIGHT * proto_sim + (1 - PROTO_WEIGHT) * centroid_sim` kalau centroid tersedia (awal: `PROTO_WEIGHT = 0.4`), selain itu `score = proto_sim`.

Centroid **hanya** memakai istilah `confirmed`/`manual` supaya tebakan sistem yang keliru tidak ikut "mengajari" dirinya sendiri.

**Aturan keputusan**
- Urutkan skor. Kalau `top1 >= AUTO_MIN_SCORE` **dan** `top1 - top2 >= AUTO_MIN_MARGIN` → pasang `top1`, `domain_source = 'auto'`.
- Kalau `top1` dan `top2` adalah induk–anak (mis. Deep Learning dan Machine Learning), syarat margin dilewati karena keduanya tidak saling bersaing; pilih yang skornya lebih tinggi.
- Selain itu → `domain_id = null`, `domain_source = 'pending'`, dan UI menampilkan 3 saran teratas.
- Simpan top-3 `{domain_id, score}` di `domain_scores` untuk UI dan kalibrasi.
- **Jangan menampilkan skor sebagai persen.** Kemiripan kosinus bukan probabilitas. Tampilkan label keyakinan berdasarkan margin: Tinggi / Sedang / Rendah.

**Status domain**

| Status | Arti | Bisa diubah sistem? |
|---|---|---|
| `pending` | Belum ada domain (belum diproses atau sistem ragu) | Ya |
| `auto` | Dipilih sistem, belum ditinjau | Ya (saat klasifikasi ulang) |
| `confirmed` | Ngurah menyetujui tebakan sistem | Tidak |
| `manual` | Ngurah memilih sendiri | Tidak |

**Konfigurasi** — satu file `supabase/functions/_shared/vocab-config.ts`:

```ts
export const VOCAB_CONFIG = {
  EMBEDDING_MODEL: "voyage-4",   // lihat §12 keputusan 1
  EMBEDDING_DIM: 512,
  PROTO_WEIGHT: 0.4,
  CENTROID_MIN_TERMS: 3,
  AUTO_MIN_SCORE: 0.3,    // ASUMSI AWAL — wajib dikalibrasi dari domain_scores nyata
  AUTO_MIN_MARGIN: 0.03,  // ASUMSI AWAL — wajib dikalibrasi
  KNN_PLACEMENT_K: 5,
} as const;
```

Fungsi keputusan ditulis sebagai fungsi murni (input: daftar skor + relasi induk; output: keputusan) supaya bisa dites dengan `deno test`.

**Kasus uji awal** (dengan domain seed di §3.5):

| Istilah | Definisi singkat | Harapan |
|---|---|---|
| tensor | struktur data multidimensi (generalisasi skalar, vektor, matriks) untuk input, bobot, dan output jaringan saraf | Deep Learning › Machine Learning |
| overfitting | model terlalu menghafal data latih sehingga buruk di data baru | Machine Learning |
| p-value | peluang mendapat hasil seekstrem itu jika hipotesis nol benar | Statistika & Probabilitas |
| eigenvector | vektor yang arahnya tidak berubah oleh transformasi linear | Matematika untuk ML |
| HDFS | sistem berkas terdistribusi di ekosistem Hadoop | Data Engineering & Big Data |
| tokenization | memecah teks menjadi token | NLP › Machine Learning |
| backpropagation | algoritma menghitung gradien loss terhadap bobot lewat aturan rantai | Deep Learning › Machine Learning |

**Klasifikasi ulang**: aksi "Klasifikasi ulang yang otomatis" menjalankan ulang aturan hanya untuk istilah `pending` dan `auto`. Dijalankan manual, misalnya setelah menambah domain baru.

### 3.4 Halaman `/vocab`

```
┌──────────────────────────────────────────────────────────────────┐
│ Kosakata                                          [Peta Otak]    │
│ 128 istilah, 9 cabang ilmu, 6 baru minggu ini                    │
├──────────────────────────────────────────────────────────────────┤
│ [Istilah        ] [Definisi (Markdown + LaTeX)          ] [Simpan]│
│ Detail lain (alias, tanggal, kaitan, domain)   Tempel banyak     │
├──────────────────────────────────────────────────────────────────┤
│ ! 3 istilah menunggu domain                          [Tinjau]    │
├──────────────────────────────────────────────────────────────────┤
│ [Cari…]  Semua 128  ML 40  DL 22  Statistika 18  …    Urut: Baru │
│ Tampilan: Daftar | Kartu                                         │
├──────────────────────────────────────────────────────────────────┤
│ tensor        Deep Learning › ML   otomatis [Benar] [Ubah]  W1   │
│   Struktur data multidimensi …                                   │
│ overfitting   Machine Learning     dikonfirmasi             W2   │
└──────────────────────────────────────────────────────────────────┘
```

Komponen (`src/components/vocab/`): `VocabQuickAdd`, `VocabBulkAdd` (dialog + pratinjau), `PendingBanner`, `VocabFilters`, `VocabList`, `VocabCard` (kartu bolak-balik: depan istilah + domain, belakang definisi), `VocabDetailDrawer`, `DomainChip`, `DomainManager`, `DomainOnboarding`.

Detail:
- Pencarian dan filter berjalan di browser (pola sama dengan halaman Catatan/Sumber): cari di istilah, alias, dan definisi.
- Tanggal belajar ditampilkan beserta nomor Week. **Gunakan helper hitungan Week yang sudah ada di `src/lib/report-template.ts`**, jangan menulis ulang logikanya.
- Detail drawer: definisi dirender dengan renderer Markdown + KaTeX yang sudah ada, alias, domain + keyakinan + riwayat sumber (auto/confirmed/manual), 6 istilah terdekat (RPC `match_vocab_terms`), kaitan ke subjek/topik/catatan, Edit, Hapus.
- Hapus = soft delete, dengan toast "Istilah dihapus" + tombol "Urungkan".
- Pintasan keyboard: `/` fokus ke pencarian, `Ctrl/Cmd + Enter` simpan di form tambah.
- **Tempel banyak**: satu istilah per baris. Pemisah dikenali berurutan: ` — `, ` – `, ` - `, `: `, tab. Penanda list (`1.`, `-`, `[ ]`) dibersihkan memakai aturan yang sama dengan fitur tempel silabus. Maks 100 baris. Tampilkan tabel pratinjau (istilah, definisi, peringatan duplikat/definisi kosong) sebelum simpan. Embedding dikirim dalam **satu** permintaan batch.
- Kartu bolak-balik bisa dibalik dengan klik, tap, atau Enter/Spasi saat fokus. Dengan `prefers-reduced-motion`, kartu langsung berganti sisi tanpa animasi.

### 3.5 Domain: onboarding dan pengelolaan

Saat belum ada domain, tampilkan `DomainOnboarding`: daftar centang domain seed (bisa diedit sebelum disimpan) + opsi "Buat sendiri".

| Domain | Induk | Deskripsi (dipakai untuk klasifikasi) |
|---|---|---|
| Machine Learning | — | Algoritma yang belajar pola dari data: model, training, evaluasi, overfitting, regularisasi, validasi |
| Deep Learning | Machine Learning | Jaringan saraf tiruan: tensor, layer, backpropagation, fungsi aktivasi, arsitektur seperti CNN dan transformer |
| NLP | Machine Learning | Pemrosesan bahasa alami: tokenisasi, embedding kata, model bahasa |
| Computer Vision | Machine Learning | Pemrosesan citra dan video: konvolusi, deteksi objek, segmentasi |
| Statistika & Probabilitas | — | Distribusi, estimasi, uji hipotesis, inferensi, korelasi, sampling |
| Matematika untuk ML | — | Aljabar linear, kalkulus, optimisasi: matriks, eigen, gradien, turunan parsial |
| Data Engineering & Big Data | — | Pengolahan dan penyimpanan data skala besar: pipeline, ETL, Hadoop, Spark, basis data |
| Pemrograman & Tools | — | Bahasa dan alat kerja: Python, pandas, NumPy, Git, Docker, notebook |
| Bioinformatika (opsional) | — | Analisis data biologis: sekuens DNA/protein, alignment, genomik |

UI pengelolaan domain menjelaskan bahwa **deskripsi domain memengaruhi klasifikasi**. Aksi: ubah nama/deskripsi/warna/induk (maks dua tingkat), gabung (pindahkan semua istilah, status sumber dipertahankan, domain lama di-soft-delete), hapus (istilah di dalamnya menjadi `pending`), klasifikasi ulang.

Warna domain memakai token palet kategorikal `domain-1` … `domain-10` (lihat §8), bukan hex bebas, supaya serasi di mode terang dan gelap.

---

## 4. Fitur B — Peta Otak (`/vocab/map`)

### 4.1 Dari embedding ke 2D

- Input: semua istilah aktif yang punya embedding. Embedding dinormalisasi panjangnya ke 1, sehingga jarak Euclid (default umap-js) mengikuti urutan kemiripan kosinus.
- **N ≥ 15**: UMAP 2D dengan `umap-js` (`nNeighbors = min(15, N - 1)`, `minDist = 0.15`, `spread = 1`). RNG di-seed (mis. mulberry32) dan seed disimpan, supaya hasil bisa diulang. Berjalan di **Web Worker** dengan `fitAsync` dan progres ke UI.
- **3 ≤ N < 15**: PCA 2D (deterministik). UMAP tidak stabil untuk data sekecil ini.
- **N < 3**: letakkan di lingkaran kecil.
- Opsi "Rapikan per bidang" (default **mati**): `setSupervisedProjection(labels)` dengan label bidang tingkat atas, hanya dari istilah `confirmed`/`manual`. Hasilnya wilayah lebih rapi, tetapi tumpang tindih makna yang sebenarnya jadi tersembunyi. Cek ke dokumentasi umap-js cara menandai label yang tidak diketahui.
- Hasil dinormalisasi ke kotak [-1, 1] dengan rasio aspek dipertahankan.

### 4.2 Stabilitas peta

- Koordinat disimpan di `vocab_terms.map_x/map_y`. Membuka peta tidak menjalankan UMAP.
- **Istilah baru** ditempatkan oleh Edge Function: ambil `KNN_PLACEMENT_K` tetangga terdekat yang sudah punya koordinat, posisi = rata-rata berbobot `w = max(sim, 0)^2`, ditambah jitter kecil deterministik (dari hash id) supaya tidak menumpuk. `map_placed = 'knn'`.
- Tampilkan banner "12 istilah ditambahkan sejak peta disusun" + tombol "Susun ulang" ketika jumlah istilah `knn` ≥ max(10, 15% N). UMAP hanya berjalan saat tombol ditekan.
- **Saat susun ulang**, sejajarkan layout baru ke layout lama dengan **Procrustes ortogonal 2D** (rotasi, refleksi, skala seragam, translasi) memakai istilah yang ada di kedua layout. Tanpa ini, peta bisa terbalik atau berputar dan terasa asing. Animasikan perpindahan titik ±600 ms (tanpa animasi bila reduced motion).
- Simpan dalam satu panggilan RPC `save_vocab_layout`.

### 4.3 Batas domain (wilayah)

- Pilihan tingkat batas: **Bidang** (default), **Cabang**, atau **Tanpa batas**. Warna titik mengikuti bidang tingkat atas.
- Per domain: buat *padded hull*. Untuk tiap titik, tambahkan 12 titik di lingkaran berjari-jari `r` (dalam satuan data, mis. 4% lebar peta), hitung `polygonHull` (d3-polygon), lalu haluskan dengan `curveCatmullRomClosed` (d3-shape). Cara ini otomatis menangani domain berisi 1 titik (lingkaran) dan 2 titik (kapsul).
- **Pencilan**: titik yang jaraknya ke medoid domain > Q3 + 1,5 × IQR tidak ikut membentuk hull (titiknya tetap digambar). Tanpa ini, satu istilah yang jauh bisa membuat wilayah membengkak.
- Isi wilayah dengan warna domain transparansi rendah, garis tipis, label "Deep Learning 22" di centroid poligon. Label disembunyikan bila bertabrakan.
- Wilayah yang saling tumpang tindih dibiarkan apa adanya. Itu informasi: istilahnya memang lintas bidang.

### 4.4 Interaksi

- **Hover (desktop) / tap (mobile)** → tooltip: istilah, jalur domain, "Dipelajari 5 Okt 2026, Week 2", kalimat pertama definisi, penanda bila domain masih `auto`/`pending`.
- **Klik** → pilih titik. Panel kanan (desktop) / bottom sheet (mobile): definisi lengkap, alias, 6 tetangga terdekat dengan skor kemiripan dari embedding asli (bukan jarak 2D), garis ke tetangga di peta dengan ketebalan/opacity sesuai skor, tombol "Buka di Kosakata".
- **Cari** → ketik istilah, peta zoom dan geser ke titiknya lalu memilihnya.
- **Legenda** → daftar bidang/cabang + jumlah. Klik untuk sembunyikan/tampilkan; hover untuk menyorot wilayah.
- **Slider Week** (Week 0 → Week sekarang) + tombol "Putar": hanya tampilkan istilah dengan `learned_on` ≤ akhir Week terpilih. Titik baru muncul dengan animasi skala; wilayah dan statistik ikut berubah. Posisi titik tetap (layout global), jadi yang berubah hanya apa yang tampil.
- **Seret titik** (sentuhan main-main ala labmgm "drag me"): titik bisa diseret, dan saat dilepas kembali ke posisinya. Pakai d3-force (`forceX`/`forceY` ke posisi tersimpan + `forceCollide` agar titik tidak menumpuk). Simulasi hanya berjalan saat ada interaksi dan berhenti saat alpha rendah. Tidak mengubah data.
- **Statistik di pojok**: total istilah, cabang ilmu aktif (domain dengan ≥1 istilah), istilah minggu ini, bidang terbesar.
- **Keadaan kosong** (< 5 istilah): jelaskan bahwa peta butuh beberapa istilah untuk terbentuk, dengan tombol "Tambah istilah".
- **Info (ⓘ)**: "Titik yang berdekatan dalam satu wilayah memang mirip maknanya. Jarak antarwilayah yang berjauhan tidak bisa dibaca secara presisi, karena UMAP menjaga struktur lokal, bukan jarak global."

```
┌──────────────────────────────────────────────────────────────────┐
│ Peta Otak          [Cari istilah…]     Batas: Bidang ▾   ⓘ        │
├─────────────┬────────────────────────────────────┬───────────────┤
│ Legenda     │                                    │ Panel detail  │
│ ● ML     40 │      ╭─ Deep Learning ─╮           │ (saat titik   │
│ ● Stat   18 │      │ •tensor  •  •   │  •        │  dipilih)     │
│ ● Math   12 │      ╰─────────────────╯           │               │
│ …           │            ╭─ Statistika ─╮        │               │
│ Statistik   │            │  •   •  •    │        │               │
├─────────────┴────────────────────────────────────┴───────────────┤
│ Week 0 ─────────●──────── Week 7   [Putar]          [Susun ulang]│
└──────────────────────────────────────────────────────────────────┘
```

### 4.5 Rendering dan performa

- SVG + `d3-zoom` (transform pada satu `<g>`). Cukup sampai ±1.500 titik. Kalau pan/zoom turun di bawah 60 fps, pindahkan titik ke Canvas dan pertahankan SVG untuk wilayah dan label.
- Hit-testing dengan `d3-quadtree` atau `d3-delaunay`.
- Impor paket d3 modular saja (`d3-zoom`, `d3-polygon`, `d3-shape`, `d3-force`, `d3-quadtree`/`d3-delaunay`), bukan `d3` utuh.
- `umap-js` hanya dimuat di dalam worker saat "Susun ulang" ditekan. Kode peta tidak boleh masuk bundle route lain.
- Muat halaman memakai RPC ringan `vocab_map_points()` (tanpa vektor). Vektor diambil lewat `vocab_embeddings()` hanya saat susun ulang (bulatkan ke 4 desimal untuk memperkecil payload).
- Label: prioritas (dipilih > hover > hasil cari > terbaru), tabrakan diselesaikan greedy dengan quadtree; makin dalam zoom, makin banyak label tampil.
- Worker di Next.js 16: pola `new Worker(new URL('./umap.worker.ts', import.meta.url))`; cek dukungannya di dokumentasi Next 16/Turbopack.

---

## 5. Model data (migrasi baru)

Letakkan di `supabase/migrations/<timestamp>_vocab.sql` (sistem migrasi disiapkan di Fase 0). Sesuaikan nama fungsi trigger `updated_at` dan gaya policy dengan yang sudah ada di `schema.sql`.

```sql
create extension if not exists vector with schema extensions;

-- Bidang / cabang ilmu
create table public.vocab_domains (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  description     text not null default '',
  color           text not null default 'domain-1',      -- nama token palet
  parent_id       uuid references public.vocab_domains(id) on delete set null,
  embedding       extensions.vector(512),                -- prototipe: nama + deskripsi + contoh
  embedding_model text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index vocab_domains_user_name_key
  on public.vocab_domains (user_id, lower(name)) where deleted_at is null;

-- Istilah
create table public.vocab_terms (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  term             text not null check (char_length(term) between 1 and 120),
  aliases          text[] not null default '{}',
  definition       text not null default '',              -- Markdown + LaTeX
  learned_on       date not null default current_date,
  domain_id        uuid references public.vocab_domains(id) on delete set null,
  domain_source    text not null default 'pending'
                   check (domain_source in ('pending','auto','confirmed','manual')),
  domain_scores    jsonb,                                  -- top-3 [{domain_id, score}]
  subject_id       uuid references public.subjects(id) on delete set null,
  syllabus_item_id uuid references public.syllabus_items(id) on delete set null,
  note_id          uuid references public.notes(id) on delete set null,
  embedding        extensions.vector(512),
  embedding_model  text,
  embedded_at      timestamptz,
  map_x            real,
  map_y            real,
  map_placed       text check (map_placed in ('layout','knn')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index vocab_terms_user_term_key
  on public.vocab_terms (user_id, lower(term)) where deleted_at is null;
create index vocab_terms_user_learned_idx on public.vocab_terms (user_id, learned_on);
create index vocab_terms_domain_idx on public.vocab_terms (domain_id);

-- Metadata layout peta
alter table public.profiles
  add column vocab_layout_params jsonb,
  add column vocab_layout_at     timestamptz;
```

Catatan:
- **Tidak perlu indeks vektor (HNSW/IVFFlat)**. Untuk ratusan sampai beberapa ribu baris, scan biasa sudah cepat; indeks menambah kompleksitas tanpa manfaat.
- `deleted_at` disertakan sejak awal (persiapan sinkronisasi offline mobile). Semua query dan RPC memfilter `deleted_at is null`.

**Trigger**
- `updated_at` otomatis untuk kedua tabel (pakai fungsi yang sudah ada).
- `vocab_terms`: sebelum update, kalau `term`, `aliases`, atau `definition` berubah → set `embedding`, `embedded_at`, `embedding_model` ke `null` (menjamin vektor selalu sesuai teks).
- `vocab_domains`: sebelum update, kalau `name` atau `description` berubah → set `embedding` ke `null`.
- Validasi kepemilikan: `domain_id`, `parent_id`, `subject_id`, `syllabus_item_id`, `note_id` harus milik `user_id` yang sama (FK saja tidak menjamin ini).
- Validasi hierarki: `parent_id` hanya boleh menunjuk domain yang tidak punya induk, dan domain yang punya anak tidak boleh diberi induk (maks dua tingkat).

**RLS** (sama seperti tabel lain):

```sql
alter table public.vocab_domains enable row level security;
alter table public.vocab_terms   enable row level security;

create policy "owner full access" on public.vocab_domains
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner full access" on public.vocab_terms
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.vocab_domains, public.vocab_terms from anon;
```

**RPC** — semuanya `security invoker` (RLS tetap berlaku) dan `set search_path = public, extensions`:

| Fungsi | Kembalian | Dipakai oleh |
|---|---|---|
| `vocab_map_points()` | `id, term, domain_id, domain_source, learned_on, snippet (200 karakter), map_x, map_y, map_placed` | Halaman peta (ringan, tanpa vektor) |
| `vocab_embeddings()` | `id, domain_id, domain_source, embedding` | Susun ulang peta |
| `match_vocab_terms(p_term_id uuid, p_count int default 6)` | `id, term, domain_id, similarity, map_x, map_y` (urut `<=>`, maks 20) | Panel detail, penempatan kNN |
| `suggest_vocab_domains(p_embedding vector(512), p_min_terms int default 3)` | `domain_id, parent_id, proto_sim, centroid_sim, n_terms` | Edge Function (skor akhir dihitung di TS) |
| `save_vocab_layout(p_coords jsonb, p_params jsonb)` | `void` — update `map_x/map_y`, `map_placed='layout'`, dan `profiles.vocab_layout_*` | Susun ulang peta |

Sketsa `suggest_vocab_domains` (pgvector mendukung `avg(vector)`; jarak kosinus tidak peka skala sehingga centroid tidak perlu dinormalisasi):

```sql
with members as (
  select domain_id, avg(embedding) as centroid, count(*)::int as n
  from public.vocab_terms
  where deleted_at is null and embedding is not null
    and domain_source in ('confirmed','manual')
  group by domain_id
)
select d.id, d.parent_id,
       1 - (d.embedding <=> p_embedding) as proto_sim,
       case when m.n >= p_min_terms then 1 - (m.centroid <=> p_embedding) end as centroid_sim,
       coalesce(m.n, 0) as n_terms
from public.vocab_domains d
left join members m on m.domain_id = d.id
where d.deleted_at is null and d.embedding is not null;
```

---

## 6. Backend: Edge Function `vocab-embed`

Lokasi: `supabase/functions/vocab-embed/index.ts`, kode bersama di `supabase/functions/_shared/`.

**Permintaan**: `POST { termIds?: string[]; domainIds?: string[]; mode?: "embed" | "reclassify" }`, maksimal 100 id per panggilan.

**Autentikasi**: verifikasi JWT aktif. Buat client Supabase dengan URL + publishable/anon key + header `Authorization` dari request, sehingga semua query berjalan sebagai pengguna di bawah RLS. **Jangan memakai `SUPABASE_SERVICE_ROLE_KEY`** walaupun tersedia di environment Edge Function. Ikuti pola yang direkomendasikan dokumentasi Supabase terbaru untuk client ber-scope pengguna.

**Langkah untuk `termIds`**:
1. Ambil baris (RLS menyaring kepemilikan).
2. Untuk baris dengan `embedding is null`: susun teks (§3.3), kirim **satu permintaan batch** ke API embedding Voyage (`input_type` untuk dokumen, `output_dimension` = 512). Cek format endpoint dan batas batch di dokumentasi Voyage.
3. Simpan `embedding`, `embedding_model`, `embedded_at`.
4. Untuk baris berstatus `pending`/`auto`: panggil `suggest_vocab_domains`, hitung skor dan keputusan (§3.3), simpan `domain_id`, `domain_source`, `domain_scores`.
5. Untuk baris dengan `map_x is null`: panggil `match_vocab_terms`, hitung posisi kNN (§4.2), simpan.
6. Kembalikan hasil per istilah `{ id, domain_id, domain_source, confidence_label, top3 }`. Kalau sebagian gagal, kembalikan hasil parsial beserta daftar error; data yang sudah tersimpan tidak pernah dibatalkan.

**Untuk `domainIds`**: embed teks prototipe domain (§3.3).
**Mode `reclassify`**: jalankan langkah 4 untuk semua istilah `pending`/`auto`, berhalaman.

**Secrets** (`supabase secrets set`): `VOYAGE_API_KEY`. Kunci ini **hanya** ada di Supabase, tidak di `.env` Next.js dan tidak pernah dikirim ke browser.

**Pemanggil**: Server Actions (`createTerm`, `createTermsBulk`, `updateTerm`, `updateDomain`, `retryPending`, `reclassifyAuto`) memakai client server yang membawa sesi pengguna. Pola ini nanti bisa dipakai langsung oleh mobile app.

**Test**: fungsi murni (penyusun teks, aturan keputusan, penempatan kNN) dites dengan `deno test`.

---

## 7. Perubahan frontend

| Lokasi | Isi |
|---|---|
| `src/app/(app)/vocab/page.tsx` | Halaman Kosakata (Server Component ambil data, komponen klien untuk filter/tambah) |
| `src/app/(app)/vocab/map/page.tsx` | Halaman Peta Otak (data dari `vocab_map_points`, komponen peta di-load secara dinamis) |
| `src/lib/actions/vocab.ts` | `createTerm`, `createTermsBulk`, `updateTerm`, `confirmTermDomain`, `setTermDomain`, `deleteTerm`, `restoreTerm`, `createDomain`, `updateDomain`, `mergeDomains`, `deleteDomain`, `seedDomains`, `retryPending`, `reclassifyAuto`, `saveLayout`. Pola sama dengan action lain: `requireUser()`, validasi, `revalidatePath("/", "layout")`, kembalikan `{ error }`. |
| `src/lib/vocab/parse-bulk.ts` | Parser tempel banyak (fungsi murni, dites) |
| `src/lib/vocab/layout/` | `umap.worker.ts`, `pca.ts`, `procrustes.ts`, `prng.ts` (fungsi murni dites, kecuali worker) |
| `src/lib/vocab/hull.ts` | Padded hull + deteksi pencilan (dites) |
| `src/components/vocab/` | Komponen di §3.4 dan komponen peta: `BrainMap`, `MapLegend`, `MapTooltip`, `MapDetailPanel`, `WeekSlider`, `RelayoutButton` |
| Navigasi | Tambah menu "Kosakata" (dengan sub-tab Daftar / Peta Otak) |
| Tipe | Pakai tipe hasil `supabase gen types` (Fase 0) untuk tabel baru |

Dependensi baru (versi stabil yang dirilis setidaknya beberapa minggu lalu): `umap-js`, paket d3 modular di §4.5, `vitest` (dev). Hindari pustaka besar lain.

---

## 8. Penyegaran UI — terinspirasi labmgm.org

### 8.1 Yang terlihat di labmgm.org

Dari struktur halamannya:
- Menu layar penuh dengan item bernomor (01 Home, 02 About Us, …), blok kontak, dan jam lokal "Malang (ID)".
- Halaman disusun sebagai **bab** ("Chapter 03: Meet the lab") dengan judul besar dua baris.
- Teks judul dan tautan diduplikasi untuk efek animasi teks bergulir saat hover.
- Area interaktif berbasis fisika: blok kata yang bisa diseret ("Drag me, just for fun", "Shake the box", "Put them back").
- **Kartu bolak-balik** ("hover or tap one to turn it over").
- Strip **marquee** teks dan logo, dengan varian logo terang/gelap.
- Detail atmosfer: koordinat (7.95° S 112.61° E), wordmark besar di footer.

Claude Code: buka situsnya sendiri (HTML/CSS, dan screenshot bila bisa) untuk melihat palet, tipografi, spasi, dan gerak. **Ambil bahasa visualnya, jangan salin** logo, gambar, teks, atau kode sumbernya. Font harus berlisensi bebas (mis. Google Fonts lewat `next/font`).

### 8.2 Adaptasi ke Study Hub

Aplikasi ini dipakai setiap hari, jadi pola situs pemasaran dipilih yang punya fungsi:

| Pola labmgm | Dipakai di Study Hub | Catatan |
|---|---|---|
| Menu layar penuh bernomor | Navigasi mobile; sidebar desktop dengan nomor kecil | Keputusan §12 no. 6 |
| Bab dengan judul besar | Header halaman. Di dashboard, penanda bab = **Week saat ini** ("Week 07"), karena Week memang berurutan | Judul besar tapi tetap ringkas di mobile |
| Teks bergulir saat hover | Item navigasi dan tombol utama | CSS saja (transform). Duplikat teks wajib `aria-hidden="true"` agar tidak dibaca dua kali oleh pembaca layar |
| Fisika seret-lepas | **Hanya** di Peta Otak (§4.4) | Satu momen main-main saja |
| Kartu bolak-balik | Tampilan Kartu di Kosakata | Fungsional: depan istilah, belakang definisi |
| Marquee | Satu strip di dashboard: istilah terbaru yang dipelajari | Berhenti saat hover; statis bila reduced motion |
| Jam lokal + koordinat | Detail kecil di header (jam perangkat + chip Week) | Client component kecil |
| Wordmark footer | Tidak dipakai | Tidak relevan untuk aplikasi |

**Tidak diambil**: smooth-scroll yang membajak scroll bawaan, animasi berbasis scroll di setiap bagian, preloader, video autoplay. Semuanya memperlambat atau mengganggu pemakaian harian.

### 8.3 Proses desain

1. Claude Code mengusulkan token: 4–6 warna inti bernama (terang dan gelap), 1–2 keluarga font dengan perannya, skala tipografi, skala spasi, radius yang berbeda menurut hierarki (bukan satu radius untuk semua), token gerak (mis. `--dur-fast: 120ms`, `--dur-base: 220ms`, satu kurva easing), dan palet kategorikal `domain-1` … `domain-10` yang kontrasnya cukup di kedua mode.
2. Tampilkan di satu halaman pratinjau khusus dev (`/dev/design`, tidak ikut production) berisi warna, tipe, tombol, chip, kartu, nav. **Tunggu persetujuan Ngurah** sebelum menerapkan.
3. Terapkan token lewat `@theme` Tailwind v4. Petakan 7 warna subjek yang sudah ada ke palet baru.
4. Pilot di shell + dashboard dulu, lalu halaman lain satu per satu.

### 8.4 Anggaran performa dan batas mutu

- Lighthouse mobile ≥ 90 untuk dashboard dan Kosakata; LCP < 2,5 s, INP < 200 ms, CLS < 0,1.
- Pertambahan JS per route (selain Peta Otak) ≤ ±30 KB gzip dibanding sebelum redesign.
- Animasi hanya `transform`/`opacity`. Semua animasi dimatikan atau disederhanakan dengan `prefers-reduced-motion`.
- Maks dua keluarga font, lewat `next/font`, subset latin, tidak ada layout shift saat font dimuat.
- Fokus keyboard terlihat, kontras teks memenuhi WCAG AA di kedua mode, target sentuh ≥ 44 px di mobile.
- **Ekspor PDF laporan (print CSS) harus tetap rapi** setelah redesign. Uji di setiap fase yang menyentuh halaman Laporan atau `/r/[token]`.
- Teks UI: Bahasa Indonesia, sentence case, kata kerja aktif. Nama aksi konsisten di seluruh alur (tombol "Simpan istilah" → toast "Istilah disimpan").

---

## 9. Integrasi dengan fitur lama

- **Dashboard**: kartu "Istilah" (total + baru minggu ini) dan strip marquee istilah terbaru (maks 20).
- **Laporan Mingguan**: fungsi isi otomatis bagian *What did you learn or discover?* menambahkan baris "Istilah baru minggu ini (n): tensor, backpropagation, …" dari istilah dengan `learned_on` di periode Week tersebut. Pertanyaan template **tidak diubah**.
- **Catatan**: di tampilan catatan, chip "Istilah terkait" (istilah dengan `note_id` catatan itu).
- **Silabus**: jumlah istilah yang terkait ke topik ditampilkan kecil di baris topik.

---

## 10. Fase pengerjaan

Perkiraan usaha adalah waktu kalender Ngurah (termasuk review dan uji manual), bukan jaminan.

### Fase 0 — Pengaman dan fondasi (±1–2 jam)
- Pastikan `.gitignore` mencakup `.env*`, `node_modules`, `.next`. `git init`, commit pertama, push ke repo **privat** GitHub. Cek tidak ada secret yang ikut ter-commit.
- Dump database (`supabase db dump`, skema + data) ke file di luar repo atau yang di-ignore.
- Jalankan `002_weekly_reports.sql` (cara lama, SQL Editor). Pastikan Laporan Mingguan berfungsi. Fitur Kosakata juga butuh `profiles.program_start` dari migrasi ini.
- Siapkan Supabase CLI: `supabase init`, `supabase link`, pindahkan SQL yang ada ke `supabase/migrations/` sebagai baseline dan tandai sudah diterapkan di remote (`supabase migration repair`), **jangan dijalankan ulang**.
- `supabase gen types typescript` → `src/lib/supabase/database.types.ts`.
- Pasang Vitest dengan satu test contoh.
- **Selesai bila**: commit ada di GitHub, laporan mingguan berfungsi, `supabase migration list` sinkron, `npm run build` sukses.

### Fase 1 — Design system dan shell (±1–2 hari)
- Usulan token + halaman pratinjau (§8.3) → persetujuan.
- Token di Tailwind, font, mode gelap, shell baru (sidebar desktop, menu layar penuh mobile, teks bergulir, jam + chip Week).
- Pilot di dashboard. Halaman lain tetap berfungsi dengan gaya dasar baru.
- **Selesai bila**: anggaran §8.4 terpenuhi di dashboard, reduced motion dihormati, ekspor PDF laporan tetap rapi.

### Fase 2 — Kosakata MVP (±2–3 hari)
- Migrasi vocab (tabel, trigger, RLS, RPC).
- Akun Voyage + secret, Edge Function `vocab-embed`, konfigurasi bersama, `deno test`.
- Server Actions dan halaman `/vocab` lengkap (§3), termasuk onboarding domain, pengelola domain dasar, tempel banyak, soft delete + urungkan.
- **Selesai bila** (uji penerimaan):
  1. Tambah "tensor" + definisi → tersimpan seketika, domain muncul dalam ±3 detik (Deep Learning › Machine Learning).
  2. Istilah ambigu → `pending` dengan 3 saran.
  3. Domain yang diubah manual tidak pernah ditimpa klasifikasi ulang.
  4. Edit definisi → embedding diperbarui; bila status `auto`, diklasifikasi ulang.
  5. API key Voyage salah → istilah tetap tersimpan sebagai tertunda; "Coba lagi" berhasil setelah key diperbaiki.
  6. RLS: akun uji kedua tidak bisa membaca atau mengubah data vocab akun utama.
  7. Tempel 30 baris → satu permintaan embedding batch.
  8. Kasus uji di §3.3 dicatat hasilnya (benar/salah + skor) untuk kalibrasi.

### Fase 3 — Peta Otak (±2–4 hari)
- `/vocab/map` dengan koordinat tersimpan, wilayah, hover/klik, tetangga, cari, legenda, slider Week, seret-lepas.
- Susun ulang di worker, fallback PCA, Procrustes, simpan layout. Penempatan kNN di Edge Function.
- **Selesai bila**: dengan ±300 istilah, peta tampil < 1 detik; susun ulang < 5 detik tanpa membekukan UI; istilah baru muncul dekat istilah sejenis tanpa susun ulang; orientasi peta stabil setelah susun ulang; pan/zoom/tap lancar di mobile.

### Fase 4 — Integrasi dan sisa redesign (±1–2 hari)
- Integrasi §9, tampilan Kartu bolak-balik, restyle halaman lain termasuk login dan `/r/[token]`.
- **Selesai bila**: semua halaman bergaya baru; ekspor PDF/Word/teks chat isinya tidak berubah; template laporan tetap sesuai guidebook.

### Fase 5 — Eksplorasi (opsional, dipilih nanti)
Tampilan 3D; wilayah bertingkat atau kontur kepadatan (`d3-contour`); flashcard / spaced repetition dari Kosakata; pencarian semantik ("cari yang mirip"); "Jadikan istilah" dari teks catatan; saran nama domain baru saat tidak ada yang cocok; ekspor Kosakata ke JSON/CSV/Anki.

---

## 11. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Redesign oleh agen merusak fitur yang dipakai tiap minggu | Laporan mingguan terganggu | Git di Fase 0, kerja per fase, checklist QA, uji ekspor PDF |
| Migrasi salah di database satu-satunya | Data hilang | Dump sebelum migrasi, konfirmasi sebelum `db push` |
| Istilah sangat pendek/akronim tanpa definisi | Klasifikasi meleset | Peringatan definisi kosong; alias ikut di-embed |
| Homonim (kernel, entropy) | Satu baris untuk dua makna | Kualifikasi dalam nama istilah; peringatan duplikat |
| Ambang klasifikasi belum terkalibrasi | Terlalu banyak `pending` atau salah otomatis | Simpan `domain_scores`, kalibrasi setelah ±30 istilah |
| Layout UMAP berubah-ubah | Peta terasa asing | Koordinat disimpan, penempatan kNN, Procrustes, susun ulang manual |
| Pembaca salah menafsirkan jarak global di peta | Kesimpulan keliru | Teks info di peta; skor kemiripan di panel dari embedding asli |
| Ketergantungan pada Voyage (kuota, perubahan API) | Embedding berhenti | Kolom `embedding_model`, skrip embed ulang, alternatif `gte-small` bawaan Supabase |
| Definisi dikirim ke pihak ketiga (Voyage) | Privasi | Isinya catatan belajar, risiko rendah; dicatat di sini agar disadari |
| Payload vektor besar saat susun ulang | Lambat | 512 dimensi, pembulatan 4 desimal, hanya saat diminta |
| Komputasi layout di browser | Mobile app nanti perlu implementasi sendiri | Koordinat tersimpan di DB sehingga mobile cukup membaca; susun ulang bisa tetap dari web |

---

## 12. Keputusan terbuka (dengan default)

| # | Keputusan | Default | Alternatif |
|---|---|---|---|
| 1 | Penyedia embedding | **Voyage `voyage-4`, 512 dimensi**: multilingual, kuota token gratis per akun besar untuk model generasi saat ini | Model `gte-small` bawaan Supabase Edge Runtime: tanpa API key, 384 dimensi (ubah tipe kolom), tetapi dilatih untuk teks bahasa Inggris |
| 2 | Bahasa definisi | Bebas (Indonesia, Inggris, campur) | Kalau selalu Inggris, `gte-small` layak dipertimbangkan |
| 3 | Hierarki domain | Dua tingkat (bidang › cabang) | Datar |
| 4 | Dimensi peta | 2D | 3D di Fase 5 (lebih memukau, lebih sulit dibaca dan lebih berat di HP) |
| 5 | "Rapikan per bidang" (UMAP terawasi) | Mati | Hidup |
| 6 | Nomor di menu navigasi ala labmgm | Ya | Tidak |
| 7 | Daftar domain seed | Tabel §3.5 | Disunting saat onboarding |

---

## 13. Prompt pembuka untuk Claude Code

```
Baca PROJECT_CONTEXT.md dan SPEC_KOSAKATA_PETA_OTAK.md sampai selesai.
Ikuti §0 (aturan main). Kita mulai dari Fase 0.
Masuk plan mode: rangkum rencanamu untuk Fase 0, daftar file/perintah yang akan
dijalankan, dan hal yang perlu aku lakukan sendiri (mis. login Supabase CLI,
membuat repo GitHub). Jangan jalankan apa pun ke project Supabase remote sebelum
aku konfirmasi. Setelah Fase 0 selesai dan aku setujui, lanjut ke Fase 1.
```

---

## Referensi

- Situs inspirasi: https://labmgm.org/
- Supabase, embedding di Edge Functions: https://supabase.com/docs/guides/ai/quickstarts/generate-text-embeddings
- Supabase, menjalankan model AI di Edge Functions: https://supabase.com/docs/guides/functions/ai-models
- Voyage AI, harga dan kuota gratis: https://docs.voyageai.com/docs/pricing
- umap-js (supervised projection, transform, parameter): https://github.com/PAIR-code/umap-js
