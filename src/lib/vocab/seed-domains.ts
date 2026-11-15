/**
 * Starter domains offered on first use (spec §3.5). Nothing is created until
 * the user picks and saves them, and every field can be edited first.
 *
 * The description matters: it is embedded as the domain's prototype and drives
 * the automatic classification.
 */
export type SeedDomain = {
  /** Stable key, only used to link branches to their field before ids exist. */
  key: string;
  name: string;
  /** Key of the field this branch belongs to. */
  parent?: string;
  description: string;
  /** Palette token, see docs/DESIGN_SYSTEM.md. */
  color: string;
  /** Pre-ticked in the onboarding list. */
  selected: boolean;
};

export const SEED_DOMAINS: SeedDomain[] = [
  {
    key: "ml",
    name: "Machine Learning",
    description: "Algoritma yang belajar pola dari data: model, training, evaluasi, overfitting, regularisasi, validasi",
    color: "domain-1",
    selected: true,
  },
  {
    key: "dl",
    name: "Deep Learning",
    parent: "ml",
    description:
      "Jaringan saraf tiruan: tensor, layer, backpropagation, fungsi aktivasi, arsitektur seperti CNN dan transformer",
    color: "domain-7",
    selected: true,
  },
  {
    key: "nlp",
    name: "NLP",
    parent: "ml",
    description: "Pemrosesan bahasa alami: tokenisasi, embedding kata, model bahasa",
    color: "domain-9",
    selected: true,
  },
  {
    key: "cv",
    name: "Computer Vision",
    parent: "ml",
    description: "Pemrosesan citra dan video: konvolusi, deteksi objek, segmentasi",
    color: "domain-2",
    selected: true,
  },
  {
    key: "stat",
    name: "Statistika & Probabilitas",
    description: "Distribusi, estimasi, uji hipotesis, inferensi, korelasi, sampling",
    color: "domain-4",
    selected: true,
  },
  {
    key: "math",
    name: "Matematika untuk ML",
    description: "Aljabar linear, kalkulus, optimisasi: matriks, eigen, gradien, turunan parsial",
    color: "domain-3",
    selected: true,
  },
  {
    key: "de",
    name: "Data Engineering & Big Data",
    description: "Pengolahan dan penyimpanan data skala besar: pipeline, ETL, Hadoop, Spark, basis data",
    color: "domain-10",
    selected: true,
  },
  {
    key: "tools",
    name: "Pemrograman & Tools",
    description: "Bahasa dan alat kerja: Python, pandas, NumPy, Git, Docker, notebook",
    color: "domain-6",
    selected: true,
  },
  {
    key: "bio",
    name: "Bioinformatika",
    description: "Analisis data biologis: sekuens DNA/protein, alignment, genomik",
    color: "domain-5",
    selected: false,
  },
];

export const DOMAIN_COLORS = [
  "domain-1",
  "domain-2",
  "domain-3",
  "domain-4",
  "domain-5",
  "domain-6",
  "domain-7",
  "domain-8",
  "domain-9",
  "domain-10",
  "domain-none",
] as const;

export type DomainColor = (typeof DOMAIN_COLORS)[number];

export const DOMAIN_COLOR_LABELS: Record<DomainColor, string> = {
  "domain-1": "Biru",
  "domain-2": "Jingga",
  "domain-3": "Toska",
  "domain-4": "Kuning",
  "domain-5": "Merah muda",
  "domain-6": "Hijau",
  "domain-7": "Ungu",
  "domain-8": "Merah",
  "domain-9": "Sian",
  "domain-10": "Cokelat",
  "domain-none": "Netral",
};

/** `chip-tone` class for a domain colour token (class names written out so Tailwind keeps them). */
export const DOMAIN_TONE_CLASS: Record<DomainColor, string> = {
  "domain-1": "tone-domain-1",
  "domain-2": "tone-domain-2",
  "domain-3": "tone-domain-3",
  "domain-4": "tone-domain-4",
  "domain-5": "tone-domain-5",
  "domain-6": "tone-domain-6",
  "domain-7": "tone-domain-7",
  "domain-8": "tone-domain-8",
  "domain-9": "tone-domain-9",
  "domain-10": "tone-domain-10",
  "domain-none": "tone-none",
};

export function asDomainColor(value: unknown): DomainColor {
  return DOMAIN_COLORS.includes(value as DomainColor) ? (value as DomainColor) : "domain-none";
}
