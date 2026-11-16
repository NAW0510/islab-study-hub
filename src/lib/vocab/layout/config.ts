/**
 * Semua angka yang mengatur tata letak Peta Otak ada di sini, supaya bisa
 * dipahami dan dikalibrasi dari satu tempat (pasangan dari vocab-config.ts,
 * yang mengatur embedding dan klasifikasi).
 *
 * Koordinat peta selalu berada di kotak [-1, 1] × [-1, 1].
 */
export const LAYOUT_CONFIG = {
  // ── Pemilihan metode menurut jumlah istilah ───────────────────────────
  /**
   * Mulai sebanyak ini, peta disusun dengan UMAP. Di bawahnya UMAP tidak
   * stabil: graf tetangganya terlalu kecil, hasilnya berubah drastis tiap
   * ada satu istilah baru. Untuk data sekecil itu dipakai PCA.
   */
  UMAP_MIN_POINTS: 15,
  /** Di bawah ini bahkan PCA tidak bermakna (butuh ≥ 3 titik untuk 2 sumbu): titik ditaruh melingkar. */
  PCA_MIN_POINTS: 3,
  /** Jari-jari lingkaran untuk kasus 1–2 istilah. */
  CIRCLE_RADIUS: 0.3,

  // ── UMAP ──────────────────────────────────────────────────────────────
  /**
   * Berapa tetangga yang dianggap "dekat" saat membangun graf. Nilai kecil
   * menonjolkan kelompok-kelompok lokal; nilai besar menonjolkan bentuk
   * global. 15 adalah nilai umum untuk ratusan titik; otomatis diturunkan
   * menjadi N − 1 kalau istilahnya lebih sedikit.
   */
  UMAP_N_NEIGHBORS: 15,
  /**
   * Jarak minimum antartitik di peta. Lebih kecil = kelompok lebih padat
   * (titik menumpuk, label sulit dibaca); lebih besar = lebih menyebar tapi
   * batas kelompok kabur. 0,15 memberi ruang untuk label tanpa mengaburkan
   * wilayah.
   */
  UMAP_MIN_DIST: 0.15,
  /** Skala sebaran; dipasangkan dengan MIN_DIST. Dibiarkan di nilai bawaan. */
  UMAP_SPREAD: 1,

  // ── Kapan menyarankan "Susun ulang" ───────────────────────────────────
  /**
   * Istilah baru ditempatkan dekat tetangganya (kNN) tanpa menyusun ulang.
   * Penempatan itu hanya perkiraan, jadi setelah cukup banyak istilah baru
   * peta sebaiknya disusun ulang. Saran muncul bila jumlah istilah kNN
   * ≥ max(RELAYOUT_MIN_KNN, RELAYOUT_KNN_SHARE × jumlah istilah).
   */
  RELAYOUT_MIN_KNN: 10,
  RELAYOUT_KNN_SHARE: 0.15,

  // ── Wilayah (batas domain) ────────────────────────────────────────────
  /**
   * Tiap titik "digembungkan" menjadi lingkaran berjari-jari ini sebelum
   * dibungkus garis batas, supaya wilayah tidak menempel di titik terluar
   * dan domain berisi 1–2 istilah tetap punya bentuk. 0,08 = 4% lebar peta.
   */
  HULL_PAD: 0.08,
  /** Jumlah titik bantu per lingkaran; 12 sudah cukup halus setelah dilengkungkan. */
  HULL_SEGMENTS: 12,
  /**
   * Titik yang jaraknya ke pusat domain > Q3 + OUTLIER_IQR × IQR dianggap
   * pencilan dan tidak ikut membentuk wilayah (titiknya tetap digambar).
   * 1,5 adalah aturan baku diagram kotak-garis.
   */
  OUTLIER_IQR: 1.5,

  // ── Gerak ─────────────────────────────────────────────────────────────
  /** Lama animasi perpindahan titik setelah susun ulang (ms). Nol bila reduced motion. */
  MOVE_MS: 600,
} as const;

export type LayoutMethod = "circle" | "pca" | "umap";

/** Disimpan di profiles.vocab_layout_params supaya layout bisa diulang persis. */
export type LayoutParams = {
  method: LayoutMethod;
  seed: number;
  n: number;
  nNeighbors?: number;
  minDist?: number;
  spread?: number;
  supervised?: boolean;
  model?: string;
};
