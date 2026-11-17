# Design system — IS Lab Study Hub

Bahasa visual aplikasi sejak restyle Bauhaus (setelah Fase 4). Terinspirasi labmgm.org: kertas tenang dan tinta, bentuk geometris dalam empat warna primer, tipografi dua peran, navigasi dan bab bernomor. Diadaptasi untuk aplikasi yang dipakai setiap hari: cepat, tenang, dan dengan transisi yang tidak terasa.

- **Sumber kebenaran**: blok token di bagian atas [`src/app/globals.css`](../src/app/globals.css).
- **Lihat langsung**: jalankan `npm run dev`, lalu buka `/dev/design`. Halaman itu hanya ada di mode dev (404 di production).
- **Dijaga test**: [`src/lib/design/contrast.test.ts`](../src/lib/design/contrast.test.ts) membaca token dari CSS dan memeriksa kontras WCAG AA di mode terang dan gelap.

## Prinsip

1. **Kertas tenang, bentuk berani.** Permukaan nyaris monokrom. Warna cerah tampil sebagai **bentuk**: empat primer Bauhaus di logo, navigasi, penanda bab, ubin statistik, dan kosong-state; plus aksen (interaksi), sinyal (status), dan palet kategorikal (subjek/domain).
2. **Satu makna per warna.** Biru tautan = bisa diklik atau sedang aktif. Hijau/kuning/merah = status. Palet kategorikal = "subjek atau domain yang mana".
3. **Teks selalu tinta.** Warna tampil sebagai bentuk, bar, atau latar lembut; teks di atasnya tetap `--text` atau `--text-2`. Kontras teks jadi selalu aman.
4. **Warna tidak pernah sendirian.** Tiap bagian aplikasi, domain, dan status punya bentuknya sendiri, jadi tetap terbedakan bagi penyandang buta warna.
5. **Nomor di navigasi, penanda Week, dan penanda bab.** Bab di dashboard bernomor sesuai urutan tampilnya.
6. **Gerak yang tidak terasa.** Hanya `transform` dan `opacity` (dua pengecualian di bagian transisi), durasi pendek, satu kurva. Transisi tidak pernah menahan input atau menunda isi. Semua gerak mati bila perangkat meminta gerak dikurangi.

## Warna

Semua warna ditulis dengan `light-dark(terang, gelap)` dan mengikuti `color-scheme`: pengaturan perangkat, atau pilihan tombol tema (lihat **Tema**). Untuk memaksa satu mode pada sebagian halaman, beri pembungkusnya kelas `theme-scope scheme-light` atau `theme-scope scheme-dark`.

### Inti

| Token | Kelas Tailwind | Peran | Terang | Gelap |
|---|---|---|---|---|
| `--bg` | `bg-bg` | Kertas: latar halaman | `#f6f6f3` | `#14171c` |
| `--surface` | `bg-surface` | Kartu, panel | `#ffffff` | `#1b1f26` |
| `--surface-2` | `bg-surface-2` | Hover, isian halus | `#efefeb` | `#242932` |
| `--border` | `border-border` | Garis rambut | `#e6e6e1` | `#2a2f38` |
| `--border-strong` | `border-border-strong` | Tepi input dan tombol sekunder | `#d4d4cd` | `#3a404b` |
| `--text` | `text-text` | Tinta: teks utama | `#0e1116` | `#ededea` |
| `--text-2` | `text-text-2` | Paragraf isi, ringkasan | `#3b4150` | `#c3c8d1` |
| `--muted` | `text-muted` | Teks sekunder | `#626a78` | `#9aa1ad` |
| `--primary` | `bg-primary` | Tombol utama (pil tinta) | `#0e1116` | `#ededea` |
| `--accent` | `text-accent`, `bg-accent` | Tautan, fokus, progres | `#2f66d0` | `#8fb0ff` |
| `--accent-soft` | `bg-accent-soft` | Sorotan lembut (= `--mark-blue-soft`) | `#eaf0fb` | `#1c2740` |
| `--scrim` | `bg-scrim` | Peredup halaman di belakang dialog dan drawer | tinta 40% | hitam 60% |

### Primer Bauhaus

Untuk bentuk, ubin, bar, dan isian lembut. **Tidak pernah untuk teks.** Warna pekatnya sama di kedua mode, seperti cat; versi lembutnya mengikuti mode.

| Token | Kelas | Nilai | Lembut (`-soft`) terang / gelap |
|---|---|---|---|
| `--mark-blue` | `bg-mark-blue` | `#2f66d0` | `#eaf0fb` / `#1c2740` |
| `--mark-yellow` | `bg-mark-yellow` | `#f5b820` | `#fdf4dc` / `#33290f` |
| `--mark-red` | `bg-mark-red` | `#ef4339` | `#fde7e5` / `#3a1c1a` |
| `--mark-green` | `bg-mark-green` | `#148a5b` | `#e3f2ea` / `#14301f` |

Bentuk di atas ubin berwarna memakai `--paper` (tetap terang di malam hari); di atas kuning memakai `--paper-ink`. Kuning di atas kertas terang hanya hiasan dan selalu membawa bentuk tinta.

### Sinyal (status)

Hanya untuk status, dan selalu bersama label teks dan bentuknya.

| Token | Arti | Nilai | Bentuk di chip |
|---|---|---|---|
| `--signal-good` | Selesai, terkirim | `--mark-green` | lingkaran |
| `--signal-warn` | Sedang dipelajari, draft | `--mark-yellow` | persegi |
| `--signal-bad` | Terlambat | `--mark-red` | segitiga |
| `--success` | Teks keberhasilan | `#0f7a4f` / `#5ccf95` | |
| `--danger`, `--danger-soft`, `--danger-fg` | Teks, latar, dan teks tombol untuk aksi berbahaya | lihat CSS |
| `--on-signal` (`text-on-signal`) | Tanda di atas warna sinyal pekat, mis. centang topik selesai | `#ffffff` / `#14171c` |

### Palet kategorikal

Untuk warna subjek sekarang dan domain Kosakata nanti.

| Token | Nama | Terang | Gelap | Bentuk di chip | Kunci subjek di database |
|---|---|---|---|---|---|
| `--domain-1` | Biru | `#2a78d6` | `#3987e5` | lingkaran | `blue` |
| `--domain-2` | Jingga | `#eb6834` | `#d95926` | persegi | |
| `--domain-3` | Toska | `#1baf7a` | `#199e70` | segitiga | `teal` |
| `--domain-4` | Kuning | `#eda100` | `#c98500` | plus | `amber` |
| `--domain-5` | Merah muda | `#e87ba4` | `#d55181` | × | `rose` |
| `--domain-6` | Hijau | `#008300` | `#008300` | bintang | `green` |
| `--domain-7` | Ungu | `#6250d6` | `#9085e9` | setengah cakram | `violet` |
| `--domain-8` | Merah | `#e34948` | `#e66767` | seperempat | |
| `--domain-9` | Sian | `#0e93b5` | `#1f9fc2` | belah ketupat | |
| `--domain-10` | Cokelat | `#a5622a` | `#b97a3a` | daun | |
| `--domain-none` | Netral (tanpa domain) | `#667085` | `#8590a6` | lingkaran | `slate` |

Aturan pakai:
- **Urutannya bagian dari palet.** Warna yang bersebelahan dipilih supaya tetap terbedakan bagi penyandang buta warna (jarak warna diuji untuk protanopia dan deuteranopia, di kedua mode). Kalau butuh warna baru, tambahkan di ujung dan validasi ulang; jangan menukar urutan.
- Tiga warna di mode terang (toska, kuning, merah muda) kontrasnya di bawah 3 : 1 terhadap putih. Karena itu warna kategorikal **selalu didampingi label teks**, tidak pernah berdiri sendiri.
- Di Peta Otak, semua titik bisa saling bersebelahan, jadi warna saja tidak cukup untuk lebih dari tiga bidang. Batas wilayah, label, dan legenda selalu ada (lihat pola Peta Otak di bawah).

## Tipografi

| Peran | Font | Kelas |
|---|---|---|
| Judul, angka besar, navigasi, nomor | Hanken Grotesk (variabel) | `display` (judul) atau `font-display` |
| Isi dan UI | Geist | `font-sans` (default) |
| Kode | Geist Mono | `font-mono` |

- Hanken Grotesk dan Geist di-preload di semua halaman. Geist Mono tidak di-preload: baru diunduh di halaman yang menampilkan kode. Nomor nav, Week, dan jam memakai angka tabular Hanken, jadi tetap dua keluarga font.
- Sapaan dashboard memakai `display` besar `clamp(2.25rem, …, 4.75rem)`; judul halaman lain tetap ringkas.
- Judul halaman memakai `clamp()` supaya ringkas di HP, contoh: `display text-[clamp(1.75rem,1.3rem+2vw,2.5rem)]`.
- Label kecil huruf besar: kelas `eyebrow`. Garis pendek di dalamnya: `eyebrow-rule`.
- Angka yang berubah atau perlu sejajar (jam, statistik, nomor): `tabular-nums`.

## Bentuk dan gerak

| Token | Kelas | Nilai | Dipakai untuk |
|---|---|---|---|
| `--r-control` | `rounded-control` | 10 px | Input, tombol ikon, item nav |
| `--r-card` | `rounded-card` | 16 px | Kartu |
| `--r-panel` | `rounded-panel` | 24 px | Panel besar |
| `--r-btn` | `rounded-btn` | pil | Tombol; chip memakai `rounded-full` |

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--dur-fast` | 120 ms | Hover, perubahan warna |
| `--dur-base` | 220 ms | Teks bergulir |
| `--dur-slow` | 420 ms | Menu layar penuh |
| `--ease-std` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Semuanya |
| `--animate-dot-in` | 320 ms, sedikit memantul | Titik baru di Peta Otak (kelas `animate-dot-in`) |
| `--vt-exit` / `--vt-enter` / `--vt-move` | 120 / 200 / 280 ms | Transisi: yang pergi, yang datang, yang berpindah |
| `--vt-wave` | 450 ms | Gelombang tema |
| `--lift-shadow` | bayangan lembut | Kartu terangkat, pil nav aktif, panel login |

## Bentuk Bauhaus

`Shape` (`src/components/shape.tsx`): kotak yang dipotong menjadi bentuk (`.shape-*` di `globals.css`) dan diisi warna (`color`: `blue`, `yellow`, `red`, `green`, `paper`, `paper-ink`, `text`, `muted`). Ukurannya lewat `size-*`. Selalu dekorasi (`aria-hidden`).

Bentuk: `circle`, `square`, `triangle`, `plus`, `x`, `spark`, `half`, `quarter`, `diamond`, `leaf`. Potongan `clip-path`-nya ada di token `--clip-*` dan dipakai bersama oleh `Shape` dan penanda chip.

| Bagian (`NAV_ITEMS`) | Bentuk | Warna |
|---|---|---|
| Dashboard | lingkaran | biru |
| Subjek & Silabus | persegi | hijau |
| Catatan | segitiga | merah |
| Kosakata | plus | kuning |
| Sumber Belajar | setengah cakram | biru |
| Laporan Mingguan | × | merah |

`BrandMark` = empat bentuk dua kali dua (seperempat biru, lingkaran kuning, segitiga merah, persegi hijau). Dashboard ditutup dengan sebaris bentuk yang tenang.

## Tema

`src/lib/theme.ts`. Tanpa pilihan, aplikasi mengikuti perangkat (`color-scheme: light dark`). Tombol tema (`ThemeToggle`, di kaki sidebar, rel Perpustakaan, dan menu HP) menyematkan `data-theme="light"`/`"dark"` di `<html>` dan mengingatnya di `localStorage` (`islab-theme`). Memilih mode yang sama dengan perangkat menghapus pilihan, jadi aplikasi kembali mengikuti perangkat.

- Script kecil `THEME_SCRIPT` di `<head>` memasang pilihan sebelum halaman tergambar: tidak ada kedipan mode lain.
- Ikon tombol dipilih CSS (`.theme-icon-*`) sebelum React hidup; `aria-pressed` menyusul.
- Dunia Perpustakaan dan Peta Otak 3D membaca `currentScheme()` dan `onSchemeChange()`, bukan `prefers-color-scheme` langsung.
- Print selalu terang.

## Gerak dan transisi

Transisi hanya di titik penting, dan dibuat supaya **tidak terasa sebagai transisi**:

1. **Tidak pernah menghalangi.** `::view-transition` memakai `pointer-events: none`, jadi klik dan ketik tetap sampai ke halaman. Navigasi baru memotong transisi yang berjalan.
2. **Tidak pernah menunda isi.** Halaman berganti seketika (snapshot `root` tidak dianimasikan); hanya bagian yang diberi nama yang bergerak di atasnya, sebentar.
3. **Selalu ada yang tetap.** Shell bagian dari `root` yang diam. Bila bisa, benda yang sama berpindah tempat.
4. **Durasi pendek** (`--vt-*`); satu-satunya gestur panjang adalah gelombang tema.
5. **Reduced motion atau browser tanpa View Transitions**: semuanya langsung berganti dan tetap berfungsi.

| Momen | Yang terjadi | Di mana |
|---|---|---|
| Pindah bagian | Halaman lama memudar 120 ms, halaman baru naik 8 px dalam 200 ms | `src/app/(app)/template.tsx` (`vt-page-out`/`vt-page-in`) |
| Halaman aktif di nav | Bentuk bagian aktif meluncur ke item baru dan berubah bentuk di jalan | `sidebar.tsx`, nama `nav-active`, kelas `vt-morph` |
| Memuat | Skeleton tak terlihat bila < 250 ms; bila sempat tampil, ia larut di atas halaman yang datang | `(app)/loading.tsx` (`vt-skeleton-out`) |
| Dialog | Muncul sedikit dari bawah dan lebih kecil (160 ms), menutup lebih cepat (120 ms), backdrop ikut | `.dialog` (`@starting-style`) |
| Bar progres | Isian meluncur ke nilai baru | `ProgressBar` (`.progress-fill`, translate) |
| Ganti tema | Mode baru membuka sebagai lingkaran dari tombol, di atas mode lama | `theme-toggle.tsx`, `data-vt="theme"` |
| Tahap 2 | Judul kartu → judul halaman (`vt-morph`), tukar tampilan di tempat (`vt-swap`), item masuk/keluar daftar | per halaman |

Pengecualian dari aturan "hanya transform/opacity": animasi ukuran grup bawaan View Transitions (snapshot, bukan layout) dan `clip-path` gelombang tema.

## Komponen dasar

| Kelas / komponen | Keterangan |
|---|---|
| `btn` + `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-danger`, `btn-sm` | Tombol pil, tinggi 40 px (32 px untuk `btn-sm`), minimal 44 px di layar sentuh |
| `btn btn-ring` | Tombol berbingkai cincin empat primer, **hanya untuk satu aksi terpenting** di halaman (mis. "Buat laporan") |
| `lift` | Kartu yang bisa diklik: terangkat 3 px dan condong 0,3° saat disorot atau difokus; bayangannya pseudo-elemen yang memudar masuk |
| `ChapterTitle` (`components/ui.tsx`) | Penanda bab: bentuk + nomor + garis + judul huruf besar. Nomornya `aria-hidden` |
| `nav-item`, `nav-number`, `nav-shape`, `nav-rail` | Item navigasi; yang aktif (`aria-current="page"`) pil kertas terangkat dengan bentuk penuh |
| `ThemeToggle` (`components/shell/theme-toggle.tsx`) | Tombol terang/gelap dengan gelombang |
| `bob`, `bob-1…3` | Goyangan pelan bentuk di sapaan dashboard dan login; diam bila gerak dikurangi |
| `icon-btn` | Tombol ikon 36 px, minimal 44 px di layar sentuh |
| `input`, `label`, `hint` | Formulir |
| `card` | Kartu |
| `dialog` | `<dialog>` modal: panel `rounded-panel` di atas `--scrim`. Lebarnya diatur di tempat pakai, mis. `dialog w-[min(32rem,calc(100vw-2rem))]` |
| `segmented` + `segmented-item` (`segmented-sm` untuk versi kecil) | Pilihan 2–4 opsi berbentuk pil. Item aktif ditandai `aria-current="page"` (tautan), `aria-pressed="true"` (tombol), atau `aria-selected="true"` (tab). Dipakai di sakelar Peta 2D/3D, Daftar/Kartu, Tulis/Pratinjau, dan jenis sumber |
| `BrandMark` (`src/components/shell/brand-mark.tsx`) | Tanda aplikasi (empat bentuk Bauhaus). Ukuran `sm`/`md`/`lg`; dipakai di shell, login, dan `/r/[token]` |
| `chip` | Chip netral |
| `chip chip-tone tone-*` | Chip berwarna: latar lembut + penanda berbentuk + teks tinta. Pilihan tone: `tone-domain-1` … `tone-domain-10`, `tone-none`, `tone-good`, `tone-warn`, `tone-bad`, `tone-info`. Bentuk penandanya di tabel palet dan sinyal |
| `RollText` (`src/components/roll-text.tsx`) | Teks bergulir saat hover/fokus untuk item nav dan tombol utama. Salinan teksnya `aria-hidden` |
| `src/components/shell/` | Sidebar desktop, menu layar penuh mobile, jam, chip Week |

Warna subjek dan status dipetakan ke kelas-kelas ini di [`src/lib/constants.ts`](../src/lib/constants.ts) (`SUBJECT_COLORS`, `STATUS_META`).

### Kartu bolak-balik (`flip-card`)

`VocabCard` (`src/components/vocab/vocab-card.tsx`), tampilan Kartu di Kosakata:

| Unsur | Aturan |
|---|---|
| Struktur | `li.flip-card` > `button.flip-card-inner` berisi dua `flip-face` (`flip-back` untuk sisi belakang). `data-flipped` di `li` memutar 180° pada sumbu Y |
| Interaksi | Tombolnya `aria-pressed`, jadi klik, tap, Enter, dan Spasi membalik. Sisi yang tersembunyi `aria-hidden` |
| Isi | Depan: Week, istilah, alias, domain atau status. Belakang: ringkasan definisi (`excerpt`); Markdown + rumus lengkap tetap di drawer |
| Aksi lain | Tombol "Buka detail" di luar bagian yang berputar, supaya tidak ikut terbalik |
| Gerak | `transform` selama `--dur-slow`; dengan reduced motion sisi langsung berganti |

### Marquee (`marquee`)

`TermMarquee` (`src/components/vocab/term-marquee.tsx`), strip "Istilah terbaru" di dashboard. Komponen server, tanpa JavaScript.

| Unsur | Aturan |
|---|---|
| Struktur | `.marquee` berisi dua `.marquee-group` yang sama, masing-masing selebar strip atau lebih, bergeser `translateX(-100%)`, jadi putarannya tanpa sambungan walau isinya sedikit. Grup kedua `aria-hidden` + `inert` |
| Berhenti | Saat hover, saat ada fokus di dalamnya, dan saat checkbox "Jeda" (`TermMarqueePause`) dicentang. Checkbox dan strip harus berada di dalam pembungkus `.marquee-host` |
| Kecepatan | 3 detik per istilah, minimal 24 detik per putaran |
| Reduced motion | Diam, salinan dan tombol Jeda disembunyikan, strip bisa digeser ke samping |

### Sub-tab

`VocabTabs` (`src/components/vocab/vocab-tabs.tsx`): garis bawah `border-accent` untuk tab aktif, `aria-current="page"`, baris bisa digeser ke samping di layar sempit. Dipakai di ketiga halaman Kosakata.

### Pola Peta Otak (`src/components/vocab/map/`)

| Unsur | Aturan |
|---|---|
| Titik | Garis nol-panjang (`M x,y h0`) dengan `stroke-linecap: round` dan `vector-effect: non-scaling-stroke`, jadi ukurannya tetap saat zoom. Warna = `var(--domain-N)` bidang tingkat atas; tanpa domain `var(--domain-none)`; istilah `pending` sedikit pudar. Muncul dengan `animate-dot-in` |
| Wilayah | Isi warna bidang dengan opasitas 0,09 (0,22 saat disorot dari legenda), garis tipis 0,55 |
| Label | `var(--text)` dengan halo `var(--surface)` (`paint-order: stroke`), supaya terbaca di atas wilayah mana pun di kedua mode. Label wilayah huruf kapital tebal. Label tidak pernah keluar kanvas |
| Pilihan | Cincin `var(--text)` di titik terpilih; garis ke 6 tetangga dengan tebal dan opasitas sesuai skor kemiripan |
| Panel detail | Panel kanan `md:w-80` di desktop, bottom sheet `rounded-t-panel` setinggi maksimal 62% peta di HP. Titik terpilih digeser keluar dari area yang tertutup panel |
| Kontrol zoom | `icon-btn` di pojok kiri atas. Di layar sentuh hanya "Tampilkan seluruh peta" (cubit untuk zoom) |
| Gerak | Pindah ke titik 450 ms, perpindahan setelah susun ulang 600 ms. Tanpa animasi saat `prefers-reduced-motion` |

### Pola Peta Otak 3D (`src/components/vocab/map/brain-map-3d.tsx` + `scenes/`)

| Unsur | Aturan |
|---|---|
| Kanvas | Pembungkus `theme-scope scheme-dark`/`scheme-light` + `text-text`, jadi semua token, termasuk panel detail, mengikuti tema kanvas, bukan tema aplikasi. Latar gradien radial dari token |
| Warna 3D | Warna token dibaca lewat elemen probe (`getComputedStyle`), supaya `light-dark()` terselesaikan. Warna benda fisik (lubang hitam, gas panas, cahaya bintang, jaringan) boleh berupa konstanta di scene karena bagian dari gambar, bukan antarmuka |
| Label | Overlay HTML yang diproyeksikan dari 3D tiap frame, tabrakan diselesaikan dengan `placeLabels`. Nama bidang: lima terbesar 60%, yang disorot 100% (`FIELD_LABELS`). Tanpa angka jumlah |
| Sorotan | `HighlightLayer`: titik terpilih/hover lebih besar dan garis ke tetangga, ikut bergerak bila istilahnya bergerak |
| Gerak | Kamera berputar dan orbit bergerak hanya saat "Putar otomatis" aktif; tidak bergerak saat `prefers-reduced-motion` |

**Menambah visualisasi 3D**: tulis kelas yang mengimplementasikan `ViewScene` (`scenes/common.ts`), lalu tambahkan satu entri di `scenes/registry.ts`. Entri itu berisi label, ikon, tema (tetap atau `"choice"`), kontrol Batas, gerak sendiri, kecepatan putar, latar, teks info, kredit, dan baris tooltip. Cangkangnya tidak perlu diubah. Scene menerima tata letak dari worker (posisi kubus, peran, tetangga, slot otak), semua istilah dan yang tampil, domain, dan fungsi warna token.

### Pola Perpustakaan (`src/components/vocab/library/`)

Kosakata › Perpustakaan: tiap istilah selembar kertas di sungai, dan perpustakaan WebGL di belakangnya. Konsepnya terinspirasi halaman Articles [MGM Laboratory](https://labmgm.org/articles) (yang meniru unseen.co); kodenya ditulis sendiri.

| Unsur | Aturan |
|---|---|
| Dua tingkat | **Rak**: satu lembar per bidang (sampul warna bidang, jumlah istilah dan cabang); mencari di rak menampilkan istilah dari semua bidang. **Ruang** (`?bidang=<id>`): istilah bidang itu, Filter memilih cabang. Masuk/keluar: adegan bergeser, sapuan warna bidang yang dilembutkan ke kabut, daftar ditukar di bawah sapuan, lembar baru meluncur masuk; tombol back browser memutar arah sebaliknya dan posisi scroll rak dipulihkan |
| Halaman istilah | `?istilah=<id>` (klik lembar; balik kartu pindah ke ikon kecil di pojok). Hero: Week + tanggal, istilah besar yang hurufnya naik dari dalam katanya, alias, chip bidang. Sampul 5:2, definisi (Markdown + KaTeX, dimuat dinamis), istilah terdekat (`match_vocab_terms`), kaitan subjek/topik/catatan, "Edit di Daftar". Blok muncul saat masuk layar; dengan reduced motion semuanya diam. Di dunia: lensa mati, kamera tenang, kabut jauh lebih tebal (`uDetail`) agar teks terbaca, dan sampul digambar sebagai lembar air (gelombang memunculkan gambar dengan buih, riak dari pointer, cipratan saat klik; `world/cover.ts`). Tanpa dunia: tirai kertas yang bergeser |
| Istilah berikutnya | Di ujung halaman istilah (`next-threshold.tsx`): hanya input setelah sampai bawah yang dihitung (gulir 2 tinggi layar, seret 400 px, atau tombol Bawah/PageDown/Spasi/End), surut 1 detik setelah diam. Progres menaikkan kubah warna bidang istilah berikutnya dan membawa namanya ke atas; di 100 % (atau klik/Enter) kubah membanjiri layar dan halaman berganti di bawahnya. Urutannya mengikuti daftar asal (ruang, hasil cari, atau bidang istilah). Tombol back langsung kembali ke ruang |
| Shell | Sidebar desktop menciut jadi rel nomor 72 px di halaman ini (tombol tema dan tombol melebarkan di bawah); tab Kosakata jadi pil kaca `segmented segmented-glass` tanpa garis |
| Sumber kebenaran | Halaman DOM lengkap tanpa WebGL: kepala lengket (judul, cari, Filter), sungai kartu, ujung daftar. Tombol/tautan kartu tetap pemilik fokus, area klik, dan nama aksesibel. Tanpa dunia, transisi memakai sapuan DOM (`.library-wash`, transform + opacity) |
| Mode | `data-library-world` di halaman: `pending` → `gl` atau `dom`. `dom` untuk reduced motion, `?noworld`, tanpa WebGL2, renderer perangkat lunak, konteks hilang, atau di bawah 8 fps (`src/lib/vocab/library/world-mode.ts`, `quality.ts`) |
| Sampul | `coverPattern(id)`: grid ubin Bauhaus 10 × 4 dari id istilah (deterministik, Fisher–Yates), warna bidang + nada gelapnya di atas `--paper`. DOM menggambarnya sebagai SVG, dunia sebagai tekstur dari path yang sama |
| Kertas | `--paper` tetap terang di malam hari, seperti kertas di bawah lampu; `--paper-ink` untuk nada gelap sampul dan ikon di atas kertas |
| Lembar | Kamera 2000 px di depan bidang kartu (1 unit = 1 px CSS). Gelombang ±24 px, lipatan di bawah kepala sampai 2400 px ke belakang, kabut kedalaman, balik 180° ke definisi. Matematika lipatan punya kembaran JS di `fold.ts` |
| Hemat GPU | Hanya kartu dalam 1 layar di atas sampai 2,1 di bawah yang punya mesh dan tekstur (maks 28); tekstur digambar dua per frame, yang terdekat dulu |
| Lensa | Distorsi barel + dispersi 10 sampel berbobot panjang gelombang (merah diam, biru paling bergeser), tumbuh dengan r⁴ supaya tengah tajam. Goresan scroll pendek (maks 18 px, ikut arah), tiap sampel diacak per piksel dan membaca mip sekasar jaraknya: satu goresan lembut, bukan deretan salinan. Grain, vinyet, denyut saat klik, sapuan transisi |
| Kursor | Cincin DOM yang tertinggal dan meregang (hanya mouse; kursor asli tetap), jejak partikel, kawanan kertas setelah diam 400 ms |
| Perpustakaan | Prosedural, satuan U = 1/9 tinggi layar: rak tiga lantai di antara pilar ramping, galeri berbalustrade, tangga geser, lengkung melintang runcing, jendela besar bertracery (lancet + rose, siang putih-emas, malam biru dengan bulan) dengan halo dan sinar, lentera berayun, lantai berbatu dengan sungai cahaya, kabut dan debu. Satu shader bahan bersama: ambient tinggi di siang hari, cahaya kunci lembut, ceruk rak lebih gelap, rim bulan di malam hari, genangan cahaya lentera, kabut tinggi + jarak dengan selubung minimum dan cahaya jendela yang menyebar di kabut. Buku pucat di siang hari, gelap di malam hari (`world/palette.ts`). Di ruang bidang semuanya condong tipis ke warna bidang. Siang/malam mengikuti `prefers-color-scheme` dan meluncur halus |
| Warna | Warna UI dibaca dari token lewat elemen probe. Warna benda di dunia (kabut, batu, cahaya) konstanta di `world/palette.ts` |
| Penyetelan | Semua angka di `src/lib/vocab/library/config.ts`, dengan alasannya. `?worldtier=medium|low` mengunci tingkat kualitas, `?noworld` mematikan dunia |

## Yang sengaja tidak ikut berubah

`.report-paper` (dokumen laporan mingguan dan halaman berbagi `/r/[token]`) dikunci ke warna, radius, dan font sebelum redesign, supaya tampilan layar, PDF, dan Word tetap sama. Jangan mengarahkan token di blok itu ke token global.

## Anggaran performa (spec §8.4)

Ukuran first-load per halaman dihitung dari hasil build:

```bash
npm run build
```

```bash
node scripts/route-js-size.mjs
```

| Halaman | Sebelum Fase 1 | Sesudah Fase 1 |
|---|---|---|
| Dashboard `/`, JS | 150,9 kB | 151,0 kB |
| `/login`, JS | 139,4 kB | 139,4 kB |
| CSS bersama | 14,2 kB | 14,8 kB |

Semua angka gzip. Batasnya: tambahan JS per halaman (selain Peta Otak) paling banyak sekitar 30 kB dibanding sebelum redesign.

Belum diukur di Fase 1: skor Lighthouse, LCP, INP, dan CLS di dashboard, karena halaman itu butuh login. Ukur lewat Chrome DevTools → Lighthouse (Mobile) pada build produksi.
