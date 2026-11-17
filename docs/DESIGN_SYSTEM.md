# Design system — IS Lab Study Hub

Bahasa visual aplikasi sejak Fase 1. Terinspirasi labmgm.org (kertas + tinta, tipografi dua peran, navigasi bernomor), diadaptasi untuk aplikasi yang dipakai setiap hari: cepat, tenang, dan tanpa gerak yang tidak perlu.

- **Sumber kebenaran**: blok token di bagian atas [`src/app/globals.css`](../src/app/globals.css).
- **Lihat langsung**: jalankan `npm run dev`, lalu buka `/dev/design`. Halaman itu hanya ada di mode dev (404 di production).
- **Dijaga test**: [`src/lib/design/contrast.test.ts`](../src/lib/design/contrast.test.ts) membaca token dari CSS dan memeriksa kontras WCAG AA di mode terang dan gelap.

## Prinsip

1. **Kertas dan tinta.** Antarmuka nyaris monokrom. Warna cerah hanya untuk hal yang punya makna: aksen (interaksi), sinyal (status), dan palet kategorikal (identitas subjek/domain).
2. **Satu makna per warna.** Biru = bisa diklik atau sedang aktif. Hijau/kuning/merah = status. Palet kategorikal = "subjek atau domain yang mana".
3. **Teks selalu tinta.** Warna tampil sebagai titik, bar, atau latar lembut; teks di atasnya tetap `--text`. Kontras teks jadi selalu aman.
4. **Nomor hanya di navigasi dan penanda Week.** Bagian halaman tidak diberi nomor.
5. **Gerak seperlunya.** Hanya `transform` dan `opacity`, tiga durasi, satu kurva. Semua gerak mati bila perangkat meminta gerak dikurangi.

## Warna

Semua warna ditulis dengan `light-dark(terang, gelap)` dan mengikuti `color-scheme` (pengaturan sistem). Untuk memaksa satu mode pada sebagian halaman, beri pembungkusnya kelas `theme-scope scheme-light` atau `theme-scope scheme-dark`.

### Inti

| Token | Kelas Tailwind | Peran | Terang | Gelap |
|---|---|---|---|---|
| `--bg` | `bg-bg` | Kertas: latar halaman | `#f7f7f4` | `#14171c` |
| `--surface` | `bg-surface` | Kartu, panel | `#ffffff` | `#1b1f26` |
| `--surface-2` | `bg-surface-2` | Hover, isian halus | `#efefea` | `#252a33` |
| `--border` | `border-border` | Garis rambut | `#e3e3dd` | `#2c313b` |
| `--border-strong` | `border-border-strong` | Tepi input dan tombol sekunder | `#cdcdc5` | `#3d4450` |
| `--text` | `text-text` | Tinta: teks utama | `#0f1216` | `#ececea` |
| `--muted` | `text-muted` | Teks sekunder | `#5c6370` | `#9aa1ad` |
| `--primary` | `bg-primary` | Tombol utama (pil tinta) | `#0f1216` | `#ececea` |
| `--accent` | `text-accent`, `bg-accent` | Tautan, nav aktif, fokus, progres | `#2a5bd7` | `#8fb0ff` |
| `--accent-soft` | `bg-accent-soft` | Sorotan lembut | `#e6edfc` | `#1c2740` |
| `--scrim` | `bg-scrim` | Peredup halaman di belakang dialog dan drawer | tinta 40% | hitam 60% |

### Sinyal (status)

Hanya untuk status, dan selalu bersama label teks.

| Token | Arti | Nilai |
|---|---|---|
| `--signal-good` | Selesai, terkirim | `#0ca30c` |
| `--signal-warn` | Sedang dipelajari, draft | `#fab219` |
| `--signal-bad` | Terlambat | `#d03b3b` |
| `--success` | Teks keberhasilan | `#006300` / `#3ecf5a` |
| `--danger`, `--danger-soft`, `--danger-fg` | Teks, latar, dan teks tombol untuk aksi berbahaya | lihat CSS |
| `--on-signal` (`text-on-signal`) | Tanda di atas warna sinyal pekat, mis. centang topik selesai | `#ffffff` / `#14171c` |

### Palet kategorikal

Untuk warna subjek sekarang dan domain Kosakata nanti.

| Token | Nama | Terang | Gelap | Kunci subjek di database |
|---|---|---|---|---|
| `--domain-1` | Biru | `#2a78d6` | `#3987e5` | `blue` |
| `--domain-2` | Jingga | `#eb6834` | `#d95926` | |
| `--domain-3` | Toska | `#1baf7a` | `#199e70` | `teal` |
| `--domain-4` | Kuning | `#eda100` | `#c98500` | `amber` |
| `--domain-5` | Merah muda | `#e87ba4` | `#d55181` | `rose` |
| `--domain-6` | Hijau | `#008300` | `#008300` | `green` |
| `--domain-7` | Ungu | `#6250d6` | `#9085e9` | `violet` |
| `--domain-8` | Merah | `#e34948` | `#e66767` | |
| `--domain-9` | Sian | `#0e93b5` | `#1f9fc2` | |
| `--domain-10` | Cokelat | `#a5622a` | `#b97a3a` | |
| `--domain-none` | Netral (tanpa domain) | `#667085` | `#8590a6` | `slate` |

Aturan pakai:
- **Urutannya bagian dari palet.** Warna yang bersebelahan dipilih supaya tetap terbedakan bagi penyandang buta warna (jarak warna diuji untuk protanopia dan deuteranopia, di kedua mode). Kalau butuh warna baru, tambahkan di ujung dan validasi ulang; jangan menukar urutan.
- Tiga warna di mode terang (toska, kuning, merah muda) kontrasnya di bawah 3 : 1 terhadap putih. Karena itu warna kategorikal **selalu didampingi label teks**, tidak pernah berdiri sendiri.
- Di Peta Otak, semua titik bisa saling bersebelahan, jadi warna saja tidak cukup untuk lebih dari tiga bidang. Batas wilayah, label, dan legenda selalu ada (lihat pola Peta Otak di bawah).

## Tipografi

| Peran | Font | Kelas |
|---|---|---|
| Judul, angka besar, navigasi | Plus Jakarta Sans | `display` (judul) atau `font-display` |
| Isi dan UI | Geist | `font-sans` (default) |
| Kode | Geist Mono | `font-mono` |

- Plus Jakarta Sans dan Geist di-preload di semua halaman. Geist Mono tidak di-preload: baru diunduh di halaman yang menampilkan kode.
- Judul halaman memakai `clamp()` supaya ringkas di HP, contoh: `display text-[clamp(1.75rem,1.3rem+2vw,2.5rem)]`.
- Label kecil huruf besar: kelas `eyebrow`. Garis pendek di dalamnya: `eyebrow-rule`.
- Angka yang berubah atau perlu sejajar (jam, statistik, nomor): `tabular-nums`.

## Bentuk dan gerak

| Token | Kelas | Nilai | Dipakai untuk |
|---|---|---|---|
| `--r-control` | `rounded-control` | 8 px | Input, tombol ikon, item nav |
| `--r-card` | `rounded-card` | 14 px | Kartu |
| `--r-panel` | `rounded-panel` | 24 px | Panel besar |
| `--r-btn` | `rounded-btn` | pil | Tombol; chip memakai `rounded-full` |

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--dur-fast` | 120 ms | Hover, perubahan warna |
| `--dur-base` | 220 ms | Teks bergulir |
| `--dur-slow` | 420 ms | Menu layar penuh |
| `--ease-std` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Semuanya |
| `--animate-dot-in` | 320 ms, sedikit memantul | Titik baru di Peta Otak (kelas `animate-dot-in`) |

## Komponen dasar

| Kelas / komponen | Keterangan |
|---|---|
| `btn` + `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-danger`, `btn-sm` | Tombol pil, tinggi 40 px (32 px untuk `btn-sm`), minimal 44 px di layar sentuh |
| `icon-btn` | Tombol ikon 36 px, minimal 44 px di layar sentuh |
| `input`, `label`, `hint` | Formulir |
| `card` | Kartu |
| `dialog` | `<dialog>` modal: panel `rounded-panel` di atas `--scrim`. Lebarnya diatur di tempat pakai, mis. `dialog w-[min(32rem,calc(100vw-2rem))]` |
| `segmented` + `segmented-item` (`segmented-sm` untuk versi kecil) | Pilihan 2–4 opsi berbentuk pil. Item aktif ditandai `aria-current="page"` (tautan), `aria-pressed="true"` (tombol), atau `aria-selected="true"` (tab). Dipakai di sakelar Peta 2D/3D, Daftar/Kartu, Tulis/Pratinjau, dan jenis sumber |
| `BrandMark` (`src/components/shell/brand-mark.tsx`) | Tanda aplikasi (ubin tinta + topi). Ukuran `sm`/`md`/`lg`; dipakai di shell, login, dan `/r/[token]` |
| `chip` | Chip netral |
| `chip chip-tone tone-*` | Chip berwarna: latar lembut + titik + teks tinta. Pilihan tone: `tone-domain-1` … `tone-domain-10`, `tone-none`, `tone-good`, `tone-warn`, `tone-bad`, `tone-info` |
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
| Shell | Sidebar desktop menciut jadi rel nomor 72 px di halaman ini (tombol di bawah untuk melebarkan); tab Kosakata jadi pil kaca `segmented segmented-glass` tanpa garis |
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
