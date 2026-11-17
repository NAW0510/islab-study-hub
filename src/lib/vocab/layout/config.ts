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

  // ── Tambahan di atas UMAP baku ────────────────────────────────────────
  /**
   * Gravitasi lemah ke titik tengah peta, diterapkan tiap epoch (bagian dari
   * jarak ke tengah, ikut mendingin bersama laju belajar UMAP).
   *
   * Kenapa perlu: UMAP hanya menarik titik yang bertetangga. Dua kelompok
   * tanpa satu pun tetangga bersama (mis. Bahasa Jepang dan Statistika) cuma
   * saling tolak sepanjang optimasi, sehingga jaraknya jadi puluhan satuan
   * dan tiap kelompok mengerut jadi bintik ketika peta dimuat ke kotaknya.
   * Jarak sejauh itu tidak membawa informasi (UMAP menjaga struktur lokal,
   * bukan jarak global). Gravitasi menahan kelompok agar tidak hanyut:
   * mereka berhenti di jarak tempat tolakan dan gravitasi seimbang. Ini
   * teknik baku tata letak graf (mis. "gravity" di ForceAtlas2).
   *
   * Diukur pada 213 istilah uji: 0 → kelompok berupa bintik, ruang kosong
   * lebar; 0,06–0,12 → kelompok terpisah jelas dan peta terisi; 0,2 →
   * kelompok mulai saling menempel. Tetangga terdekat tiap istilah tidak
   * berubah (kemurnian 5 tetangga tetap 0,97–0,98).
   */
  UMAP_GRAVITY: 0.1,
  /**
   * Titik awal UMAP. Bawaan umap-js adalah sebaran ACAK di kotak ±10,
   * sehingga susunan peta berubah total tiap kali disusun. Di sini titik
   * awal selalu bermakna:
   *   - susun dari awal: proyeksi PCA (deterministik, menjaga susunan
   *     global; dianjurkan Kobak & Linderman, 2021);
   *   - susun ulang: posisi di peta yang sekarang (lihat RELAYOUT_ANCHOR).
   *
   * Setengah lebar kotak titik awal PCA = nilai ini × √N. Kotak ±10 dirancang
   * untuk ribuan titik; dengan skala √N kerapatan awal kira-kira tetap
   * berapa pun jumlah istilahnya.
   */
  UMAP_INIT_EXTENT_PER_SQRT_N: 0.25,
  /** Batas atas kotak titik awal: nilai bawaan UMAP. */
  UMAP_INIT_MAX_EXTENT: 10,

  // ── Susun ulang: menjaga peta tetap dikenali ──────────────────────────
  /**
   * Saat susun ulang, tiap istilah yang posisinya berasal dari penyusunan
   * sebelumnya ditarik ke posisi lamanya (bagian dari jaraknya per epoch),
   * seperti "alignment regularisation" pada AlignedUMAP. Istilah baru bebas
   * mencari tempat. Procrustes sesudahnya meluruskan sisa putaran.
   *
   * Diukur dengan menambah 43 istilah ke peta 213 istilah (pergeseran
   * rata-rata, lebar peta = 2): tanpa jangkar dan mulai dari awal ≈ 0,45
   * (wilayah berpindah tempat); mulai dari peta lama tanpa jangkar ≈ 0,3;
   * jangkar 0,2–0,4 ≈ 0,10–0,14 (wilayah tetap di tempatnya, hanya
   * susunan dalam kelompok yang bergeser). Lebih besar = lebih kaku.
   */
  RELAYOUT_ANCHOR: 0.25,
  /**
   * Susun ulang hanya berangkat dari peta lama kalau minimal sebagian ini
   * dari istilahnya pernah ditempatkan oleh penyusunan (bukan kNN). Di
   * bawahnya peta lama terlalu sedikit untuk jadi pegangan: susun dari awal.
   */
  WARM_START_MIN_SHARE: 0.5,
  /** Istilah tanpa posisi berangkat dari rata-rata berbobot sekian istilah termiripnya (sama dengan KNN_PLACEMENT_K). */
  WARM_START_K: 5,

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
  /** Titik awal UMAP: PCA (peta pertama) atau peta sebelumnya (susun ulang). */
  init?: "pca" | "previous";
  /** Satuan UMAP per satuan kotak peta; dipakai susun ulang berikutnya untuk berangkat dari peta ini. */
  unitsPerBox?: number;
  model?: string;
};

/**
 * Peta Otak 3D (`/vocab/map/3d`): angka yang khusus untuk ruang tiga dimensi.
 * Selebihnya (jumlah tetangga UMAP, MIN_DIST, SPREAD, ambang PCA/UMAP,
 * jumlah tetangga untuk titik awal) sama dengan peta 2D dan dibaca dari
 * LAYOUT_CONFIG di atas, supaya kedua peta menceritakan kedekatan yang sama.
 *
 * Koordinat 3D tidak disimpan di database: dihitung di browser dan disimpan
 * di cache browser. Ruang dimuat ke kubus [-1, 1]³.
 */
export const LAYOUT_3D_CONFIG = {
  /**
   * Seed tetap. Dengan data yang sama, ruang 3D selalu sama persis tanpa
   * perlu menyimpan apa pun; tidak ada tombol "susun ulang" di 3D.
   */
  SEED: 3,
  /**
   * Setengah lebar kubus titik awal PCA = nilai ini × ∛N. Di 3D kerapatan
   * mengikuti volume, jadi skalanya akar pangkat tiga (di 2D akar kuadrat);
   * dengan 0,25 jarak awal antartitik kira-kira sama dengan peta 2D.
   */
  INIT_EXTENT_PER_CBRT_N: 0.25,
  /**
   * Gravitasi lemah ke tengah, sama alasannya dengan UMAP_GRAVITY di 2D:
   * kelompok tanpa tetangga bersama tidak hanyut menjauh dan mengerut.
   */
  GRAVITY: 0.1,
  /**
   * Saat data berubah, ruang baru berangkat dari ruang 3D sebelumnya (dari
   * cache) dan tiap istilah lama ditarik ke posisi lamanya, seperti
   * RELAYOUT_ANCHOR di 2D, supaya gambar yang sudah kamu kenal tidak teracak.
   */
  ANCHOR: 0.25,

  // ── Wilayah 3D ─────────────────────────────────────────────────────────
  /**
   * Tiap titik "digembungkan" menjadi bola berjari-jari ini sebelum dibungkus
   * selubung (padanan HULL_PAD di 2D), supaya wilayah tidak menempel di titik
   * terluar dan bidang berisi 1–2 istilah tetap terlihat sebagai bola/kapsul.
   * 0,1 = 5% sisi kubus.
   */
  REGION_PAD: 0.1,
  /** Jumlah arah di permukaan tiap bola bantu; 26 cukup bulat setelah dibungkus. */
  REGION_DIRECTIONS: 26,

  // ── Luar angkasa: peran istilah (dihitung per cabang dari embedding) ───
  /**
   * Bagian istilah paling sentral di cabangnya (rata-rata kemiripan dengan
   * istilah lain di cabang itu paling tinggi) yang menjadi planet; minimal 1.
   * 25% memberi sekitar tiga bulan per planet: cukup ramai tanpa menutupi.
   */
  PLANET_SHARE: 0.25,
  /**
   * Bagian bulan dengan kemiripan terlemah ke planetnya yang menjadi batuan
   * (istilah yang hubungannya longgar). Hanya di cabang dengan minimal
   * ROCK_MIN_GROUP istilah; cabang kecil tidak punya batuan. Berbasis
   * peringkat, bukan ambang kosinus, karena kosinus Voyage antartopik yang
   * tidak berhubungan pun sekitar 0,45.
   */
  ROCK_SHARE: 0.2,
  ROCK_MIN_GROUP: 5,

  // ── Luar angkasa: ukuran dan gerak (satuan ruang; kubus kosinus = 2) ───
  /** Pusat galaksi = pusat bidangnya di ruang UMAP × nilai ini, lalu direnggangkan. */
  GALAXY_SPREAD: 4,
  /** Jari-jari galaksi = BASE + PER_SQRT × √(jumlah istilah bidang). */
  GALAXY_RADIUS_BASE: 0.7,
  GALAXY_RADIUS_PER_SQRT: 0.12,
  /** Jarak minimum antargalaksi, sebagai kelipatan jumlah kedua jari-jarinya. */
  GALAXY_GAP: 1.25,
  /** Kemiringan maksimum cakram galaksi (derajat), supaya tiap galaksi berbeda sudut. */
  GALAXY_MAX_TILT: 35,
  /** Jari-jari event horizon, sebagai bagian dari jari-jari galaksinya. */
  BLACK_HOLE_SHARE: 0.07,
  /**
   * Kecepatan sudut dasar (radian per detik). Benda yang lebih jauh dari
   * pusatnya bergerak lebih lambat (hukum Kepler: ω ∝ r^-1,5).
   */
  ORBIT_SPEED: 0.35,
} as const;

