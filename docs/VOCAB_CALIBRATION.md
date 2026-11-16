# Kalibrasi klasifikasi Kosakata

Ambang keputusan di `supabase/functions/_shared/vocab-config.ts` masih **asumsi awal**:

| Parameter | Nilai awal | Arti |
|---|---|---|
| `AUTO_MIN_SCORE` | 0.3 | Skor teratas minimal supaya domain dipasang otomatis |
| `AUTO_MIN_MARGIN` | 0.03 | Selisih minimal atas pesaing terdekat (di luar pasangan induk–cabang) |
| `PROTO_WEIGHT` | 0.4 | Bobot prototipe vs centroid istilah yang sudah disetujui |

Skor adalah kemiripan kosinus (−1…1), **bukan probabilitas** — jangan dibaca sebagai persen.

## Cara kalibrasi

1. Tambah istilah seperti biasa selama 1–2 minggu (idealnya ±30 istilah).
2. Tiap istilah menyimpan 3 skor teratasnya di kolom `domain_scores`, apa pun keputusannya.
3. Lihat sebarannya di SQL Editor:

   ```sql
   select term, domain_source,
          (domain_scores -> 0 ->> 'score')::numeric  as top1,
          (domain_scores -> 1 ->> 'score')::numeric  as top2
   from vocab_terms
   where deleted_at is null and domain_scores is not null
   order by top1 desc;
   ```

4. Kalau terlalu banyak `pending` padahal tebakan teratas benar → turunkan `AUTO_MIN_MARGIN` (atau `AUTO_MIN_SCORE`).
   Kalau ada tebakan otomatis yang salah → naikkan ambangnya; lihat seberapa jauh skor kasus salah itu dari kasus benar.
5. Ubah nilainya di `vocab-config.ts`, deploy ulang fungsi (`npx supabase functions deploy vocab-embed`), lalu jalankan
   "Klasifikasi ulang yang otomatis" di halaman Kelola domain. Pilihan `confirmed`/`manual` tidak pernah disentuh.

## Uji penerimaan spec §3.3 (dengan Voyage asli)

Diisi setelah fungsi di-deploy (Gate B) memakai domain seed bawaan dan definisi versimu sendiri.

Hasil 16 Nov 2026 (`voyage-4`, 512 dimensi, domain seed bawaan, definisi ditulis Ngurah,
ambang awal `AUTO_MIN_SCORE 0.3` / `AUTO_MIN_MARGIN 0.03`): **7 dari 7 benar**, semuanya
terpasang otomatis dalam ±3 detik.

| Istilah | Harapan | Hasil | top1 | top2 | Catatan |
|---|---|---|---|---|---|
| tensor | Deep Learning › Machine Learning | ✅ otomatis | | | |
| overfitting | Machine Learning | ✅ otomatis | | | |
| p-value | Statistika & Probabilitas | ✅ otomatis | | | |
| eigenvector | Matematika untuk ML | ✅ otomatis | | | |
| HDFS | Data Engineering & Big Data | ✅ otomatis | | | |
| tokenization | NLP › Machine Learning | ✅ otomatis | | | |
| backpropagation | Deep Learning › Machine Learning | ✅ otomatis | | | |

Kolom skor sengaja kosong: isi dari query `domain_scores` di atas saat kalibrasi pertama
(setelah ±30 istilah nyata). Dengan 7/7 benar, ambang awal belum perlu diubah.

Catat juga istilah nyata yang salah tebak selama pemakaian — itu bahan kalibrasi yang paling berharga.

## Hasil uji dengan server tiruan (16 Nov 2026, bukan Voyage asli)

Alur lengkap diuji di stack lokal dengan embedding tiruan deterministik (bag-of-words):
klasifikasi otomatis, saran untuk istilah ragu, konfirmasi, reclassify yang tidak menyentuh
pilihan manual, 30 istilah dalam satu batch, dan key salah yang tidak menghilangkan data.
Angka skor dari server tiruan tidak bisa dipakai untuk kalibrasi.
