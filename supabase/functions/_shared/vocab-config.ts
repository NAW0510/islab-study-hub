/**
 * Semua angka yang mengatur embedding dan klasifikasi Kosakata ada di sini,
 * supaya bisa dipahami dan dikalibrasi dari satu tempat.
 *
 * Dipakai Edge Function `vocab-embed` (Deno) dan aplikasi Next.js (label
 * keyakinan). File ini TypeScript murni: jangan impor apa pun yang khusus
 * Deno atau Node.
 *
 * Skor di sini adalah kemiripan kosinus (−1 … 1), BUKAN probabilitas. Jangan
 * pernah menampilkannya sebagai persen.
 */
export const VOCAB_CONFIG = {
  // ── Embedding ─────────────────────────────────────────────────────────
  /** Model Voyage AI. Multibahasa, jadi definisi boleh Indonesia, Inggris, atau campur. */
  EMBEDDING_MODEL: "voyage-4",
  /**
   * Panjang vektor. 512 cukup untuk membedakan bidang ilmu, separuh ukuran
   * default (1024), sehingga penyimpanan dan pengiriman ke browser lebih
   * ringan. Mengubahnya berarti mengubah tipe kolom `vector(512)` di database
   * dan meng-embed ulang semua baris.
   */
  EMBEDDING_DIM: 512,
  /**
   * Teks istilah dipotong di sekitar sini sebelum di-embed. Definisi yang
   * sangat panjang tidak menambah sinyal untuk klasifikasi bidang, hanya
   * menambah token.
   */
  MAX_TEXT_CHARS: 1000,
  /** Maksimal contoh istilah yang ikut ke teks prototipe domain. */
  PROTOTYPE_EXAMPLES: 8,
  /** Batas id per panggilan Edge Function (satu batch ke Voyage). */
  MAX_IDS_PER_REQUEST: 100,

  // ── Skor per domain ───────────────────────────────────────────────────
  /**
   * score = PROTO_WEIGHT × proto_sim + (1 − PROTO_WEIGHT) × centroid_sim
   *
   * proto_sim    = kemiripan dengan prototipe (nama + deskripsi domain).
   * centroid_sim = kemiripan dengan rata-rata istilah yang SUDAH kamu setujui
   *                di domain itu.
   * Centroid diberi bobot lebih besar (0,6) karena ia mencerminkan cara kamu
   * sendiri mengelompokkan istilah; prototipe hanya deskripsi satu kalimat.
   * Naikkan angka ini kalau tebakan terlalu "terseret" oleh istilah lama.
   */
  PROTO_WEIGHT: 0.4,
  /**
   * Centroid baru dipakai kalau domain punya minimal sekian istilah
   * confirmed/manual. Rata-rata dari 1–2 istilah terlalu acak untuk dipercaya;
   * di bawah batas ini skor = proto_sim saja.
   */
  CENTROID_MIN_TERMS: 3,

  // ── Aturan keputusan ──────────────────────────────────────────────────
  /**
   * ASUMSI AWAL, wajib dikalibrasi dari `domain_scores` nyata.
   * Skor teratas harus setinggi ini supaya domain dipasang otomatis. Di
   * bawahnya, istilah dianggap tidak mirip domain mana pun dan menunggu
   * pilihanmu.
   */
  AUTO_MIN_SCORE: 0.3,
  /**
   * ASUMSI AWAL, wajib dikalibrasi.
   * Selisih minimal antara skor teratas dan pesaing terdekatnya. Selisih
   * kecil berarti sistem ragu antara dua domain, jadi ia bertanya.
   * Pesaing = domain terbaik di luar pasangan induk–cabang skor teratas
   * (Deep Learning dan Machine Learning tidak saling bersaing).
   */
  AUTO_MIN_MARGIN: 0.03,
  /** Berapa skor teratas yang disimpan di `domain_scores` (untuk saran dan kalibrasi). */
  TOP_SCORES_KEPT: 3,

  // ── Label keyakinan di UI (dari selisih yang sama) ────────────────────
  /** Selisih ≥ ini → "Tinggi". */
  CONFIDENCE_HIGH_MARGIN: 0.08,
  /** Selisih ≥ ini → "Sedang"; di bawahnya "Rendah". Sengaja sama dengan AUTO_MIN_MARGIN. */
  CONFIDENCE_MEDIUM_MARGIN: 0.03,

  // ── Peta Otak: menempatkan istilah baru tanpa menyusun ulang ──────────
  /**
   * Istilah baru ditaruh di rata-rata posisi K tetangga terdekatnya (yang
   * sudah punya posisi), dengan bobot w = max(sim, 0)². Kuadrat membuat
   * tetangga yang sangat mirip jauh lebih menentukan daripada yang agak
   * mirip. K = 5: cukup banyak supaya satu tetangga yang salah tidak
   * menyeret posisi, cukup sedikit supaya tetap berada di kelompoknya.
   */
  KNN_PLACEMENT_K: 5,
  /**
   * Geseran kecil dan tetap (dihitung dari id istilah) supaya dua istilah
   * dengan tetangga yang sama tidak menumpuk di titik yang persis sama.
   * Peta berukuran 2 × 2, jadi 0,02 = 1% lebar peta.
   */
  KNN_JITTER_RADIUS: 0.02,
} as const;

type Widen<T> = T extends number ? number : T extends string ? string : T;

/** Same keys as VOCAB_CONFIG with plain `number`/`string` values, so tests can pass other thresholds. */
export type VocabConfig = { readonly [K in keyof typeof VOCAB_CONFIG]: Widen<(typeof VOCAB_CONFIG)[K]> };
