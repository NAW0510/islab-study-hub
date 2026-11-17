// Fills the LOCAL Supabase stack with synthetic, clustered vocabulary so the
// brain map can be tried with a realistic number of terms:
//
//   node scripts/seed-local-vocab.mjs              # up to 300 terms
//   node scripts/seed-local-vocab.mjs --count=270  # fewer (run again with a higher number to add more)
//   node scripts/seed-local-vocab.mjs --reset      # delete the dev account's vocabulary first
//
// Needs: `npx supabase start`, `node scripts/voyage-mock.mjs` and
// `npx supabase functions serve --env-file supabase/functions/.env`.
//
// It goes through the same path as the app (insert rows, then call the
// `vocab-embed` function), signed in as the local dev account. The terms and
// "definitions" are word salad on purpose: the Voyage mock is a bag of words,
// so terms that share words land close together. Nothing here is real study
// material, and nothing can reach the real project (localStack() refuses any
// URL that is not localhost).
import { localStack, signInDev } from "./local-stack.mjs";

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const COUNT = Math.max(1, Math.min(600, Number(args.get("count") ?? 300)));
const RESET = args.has("reset");
const PROGRAM_START_FALLBACK = "2026-09-28";

// ── Synthetic fields and branches ─────────────────────────────────────────
// `shared` words appear in every branch of the field (so sibling branches end
// up nearer to each other than to other fields); `words` are the branch's own.
// `related` names a field some terms borrow words from, the way real terms
// straddle two subjects. Bahasa Jepang has none: it stays an island of its own.
const FIELDS = [
  {
    name: "Machine Learning",
    color: "domain-1",
    related: "Statistika",
    shared: ["model", "pelatihan", "dataset", "prediksi", "fitur", "bobot"],
    branches: [
      { name: "Deep Learning", words: ["konvolusi", "lapisan", "neuron", "aktivasi", "gradien", "backpropagation", "tensor", "dropout", "transformer", "atensi", "embedding", "epoch", "batch", "optimizer", "relu", "softmax", "residual", "encoder", "decoder", "normalisasi"] },
      { name: "Pembelajaran Terawasi", words: ["regresi", "klasifikasi", "label", "pohon", "keputusan", "hutan", "acak", "margin", "kernel", "validasi", "silang", "overfitting", "regularisasi", "presisi", "recall", "ambang", "boosting", "ensemble", "tetangga", "galat"] },
    ],
  },
  {
    name: "Statistika",
    color: "domain-2",
    related: "Machine Learning",
    shared: ["sampel", "populasi", "variabel", "distribusi", "parameter", "estimasi"],
    branches: [
      { name: "Inferensi", words: ["hipotesis", "signifikansi", "interval", "kepercayaan", "uji", "nilai", "kritis", "varians", "simpangan", "baku", "anova", "korelasi", "kovarians", "bootstrap", "likelihood", "bayes", "posterior", "prior", "penduga", "bias"] },
      { name: "Probabilitas", words: ["peluang", "kejadian", "bebas", "bersyarat", "ekspektasi", "momen", "binomial", "poisson", "normal", "eksponensial", "kontinu", "diskret", "kepadatan", "kumulatif", "markov", "rantai", "martingale", "konvergen", "limit", "pusat"] },
    ],
  },
  {
    name: "Basis Data",
    color: "domain-3",
    related: "Rekayasa Perangkat Lunak",
    shared: ["tabel", "kueri", "indeks", "transaksi", "skema", "penyimpanan"],
    branches: [
      { name: "Relasional", words: ["join", "kunci", "primer", "asing", "normalisasi", "relasi", "baris", "kolom", "agregat", "subkueri", "view", "trigger", "prosedur", "kendala", "isolasi", "atomik", "rollback", "commit", "planner", "kardinalitas"] },
      { name: "NoSQL dan Terdistribusi", words: ["dokumen", "replika", "sharding", "partisi", "konsistensi", "eventual", "kuorum", "graf", "kolumnar", "cache", "konsensus", "raft", "vektor", "jam", "gosip", "kompaksi", "memtable", "bloom", "ketersediaan", "latensi"] },
    ],
  },
  {
    name: "Jaringan Komputer",
    color: "domain-4",
    related: "Basis Data",
    shared: ["paket", "alamat", "protokol", "koneksi", "server", "klien"],
    branches: [
      { name: "Protokol", words: ["tcp", "udp", "http", "dns", "routing", "subnet", "gateway", "handshake", "segmen", "port", "soket", "kongesti", "jendela", "ack", "ttl", "bgp", "ethernet", "frame", "nat", "multiplex"] },
      { name: "Keamanan Jaringan", words: ["enkripsi", "sertifikat", "tls", "firewall", "autentikasi", "otorisasi", "token", "hash", "tanda", "tangan", "digital", "serangan", "phishing", "injeksi", "intrusi", "kerentanan", "kriptografi", "simetris", "asimetris", "audit"] },
    ],
  },
  {
    name: "Rekayasa Perangkat Lunak",
    color: "domain-5",
    related: "Jaringan Komputer",
    shared: ["kode", "modul", "fungsi", "rilis", "kebutuhan", "tim"],
    branches: [
      { name: "Pengujian", words: ["unit", "integrasi", "regresi", "mock", "fixture", "cakupan", "asersi", "skenario", "otomatis", "pipeline", "lint", "fuzzing", "mutasi", "smoke", "penerimaan", "defect", "reproduksi", "stub", "harness", "flaky"] },
      { name: "Arsitektur", words: ["layanan", "mikro", "monolit", "antarmuka", "kopling", "kohesi", "pola", "observer", "pabrik", "dependensi", "inversi", "lapis", "domain", "event", "antrean", "gateway", "skalabilitas", "abstraksi", "komponen", "kontrak"] },
    ],
  },
  {
    name: "Bahasa Jepang",
    color: "domain-6",
    shared: ["kalimat", "kata", "makna", "bacaan", "contoh", "percakapan"],
    branches: [
      { name: "Tata Bahasa", words: ["partikel", "predikat", "subjek", "kopula", "konjugasi", "lampau", "negatif", "sopan", "kasual", "pasif", "kausatif", "potensial", "volisional", "klausa", "keterangan", "transitif", "intransitif", "honorifik", "bentuk", "kamus"] },
      { name: "Kanji dan Kosakata", words: ["goresan", "radikal", "onyomi", "kunyomi", "hiragana", "katakana", "furigana", "gabungan", "homofon", "sinonim", "antonim", "serapan", "ungkapan", "idiom", "tingkat", "urutan", "tulisan", "mnemonik", "komponen", "piktograf"] },
    ],
  },
];
// Filler words any term may use: they blur the clusters a little, as ordinary prose does.
const NOISE = [
  "umum", "dasar", "lanjut", "catatan", "ringkas", "utama", "terkait", "praktik", "teori", "sering", "penting", "awal",
  "akhir", "besar", "kecil", "cepat", "lambat", "sederhana", "rumit", "langkah", "hasil", "sebab", "akibat", "tujuan",
  "syarat", "ukuran", "bagian", "jenis", "cara", "masalah", "solusi", "perbandingan", "ilustrasi", "rangkuman", "definisi", "istilah",
];

// ── Deterministic randomness (same data on every run) ─────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261117);
const pick = (list) => list[Math.floor(random() * list.length)];
const sample = (list, n) => [...list].sort(() => random() - 0.5).slice(0, n);
const title = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Every term, in a fixed order that interleaves the branches (so `--count` cuts all of them evenly). */
function buildTerms(programStart, today) {
  const span = Math.max(1, Math.round((Date.parse(today) - Date.parse(programStart)) / 86_400_000));
  const branches = FIELDS.flatMap((field) => field.branches.map((branch) => ({ field, branch })));
  const perBranch = Math.ceil(600 / branches.length);
  const names = new Set();
  const byBranch = branches.map(({ field, branch }, b) => {
    // Each branch "starts" a few days after the previous one, so the week slider shows the map growing.
    const firstDay = Math.min(span, Math.floor((b / branches.length) * span * 0.7));
    return Array.from({ length: perBranch }, (_, i) => {
      let name;
      do {
        const [first, second] = sample(branch.words, 2);
        name = `${title(first)} ${second}`;
      } while (names.has(name.toLowerCase()));
      names.add(name.toLowerCase());
      // Most of a definition is the branch's own vocabulary; some terms lean on the sibling
      // branch or on a related field, which is what joins the clusters on the map.
      const sibling = field.branches.find((other) => other !== branch);
      const related = FIELDS.find((other) => other.name === field.related);
      const borrowed =
        i % 5 === 2 ? sample(sibling.words, 3) : i % 9 === 4 && related ? sample(pick(related.branches).words, 3) : [];
      const words = [
        ...name.toLowerCase().split(" "),
        ...sample(branch.words, borrowed.length ? 3 : 5),
        ...borrowed,
        ...sample(field.shared, 2),
        ...sample(NOISE, 3),
      ];
      return {
        term: name,
        definition: `${title(words.join(" "))}.`,
        learned_on: addDays(programStart, Math.min(span, firstDay + Math.floor(random() * (span - firstDay + 1)))),
        domain: branch.name,
        // Most terms are filed by hand; every fourth one is left for the classifier (auto or pending).
        manual: i % 4 !== 3,
      };
    });
  });
  return Array.from({ length: perBranch }, (_, i) => byBranch.map((list) => list[i])).flat();
}

// ── REST helpers ──────────────────────────────────────────────────────────
const stack = localStack();
const token = await signInDev(stack);
const headers = { apikey: stack.key, authorization: `Bearer ${token}`, "content-type": "application/json" };

async function rest(path, init = {}) {
  const res = await fetch(`${stack.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const insert = (table, rows) => rest(table, { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(rows) });

async function embed(body) {
  const res = await fetch(`${stack.url}/functions/v1/vocab-embed`, { method: "POST", headers, body: JSON.stringify(body) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`vocab-embed → ${res.status}: ${result.error ?? "apakah \`supabase functions serve\` dan voyage-mock berjalan?"}`);
  }
  if (result.errors?.length) throw new Error(`vocab-embed: ${JSON.stringify(result.errors)}`);
  return result;
}
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

// ── Seed ──────────────────────────────────────────────────────────────────
if (RESET) {
  await rest("vocab_terms?id=not.is.null", { method: "DELETE" });
  await rest("vocab_domains?id=not.is.null", { method: "DELETE" });
  await rest("profiles?user_id=not.is.null", { method: "PATCH", body: JSON.stringify({ vocab_layout_params: null, vocab_layout_at: null }) });
  console.log("Kosakata akun dev dikosongkan.");
}

const profile = (await rest("profiles?select=program_start"))[0];
const programStart = profile?.program_start ?? PROGRAM_START_FALLBACK;
const today = new Date().toISOString().slice(0, 10);

// Domains: create the missing ones, then embed their prototypes.
const domains = new Map((await rest("vocab_domains?select=id,name&deleted_at=is.null")).map((d) => [d.name, d.id]));
const newDomainIds = [];
for (const field of FIELDS) {
  if (!domains.has(field.name)) {
    const [row] = await insert("vocab_domains", [{ name: field.name, color: field.color, description: field.shared.join(", ") }]);
    domains.set(field.name, row.id);
    newDomainIds.push(row.id);
  }
  for (const branch of field.branches) {
    if (domains.has(branch.name)) continue;
    const [row] = await insert("vocab_domains", [
      { name: branch.name, color: field.color, parent_id: domains.get(field.name), description: [...branch.words, ...field.shared].join(", ") },
    ]);
    domains.set(branch.name, row.id);
    newDomainIds.push(row.id);
  }
}
if (newDomainIds.length > 0) {
  await embed({ domainIds: newDomainIds });
  console.log(`${newDomainIds.length} domain dibuat.`);
}

// Terms: skip the ones that already exist, so a second run with a higher --count only adds the difference.
const existing = new Set((await rest("vocab_terms?select=term&deleted_at=is.null&limit=1000")).map((t) => t.term.toLowerCase()));
const wanted = buildTerms(programStart, today).slice(0, COUNT).filter((t) => !existing.has(t.term.toLowerCase()));
if (wanted.length === 0) {
  console.log(`Sudah ada ${existing.size} istilah; tidak ada yang perlu ditambahkan.`);
  process.exit(0);
}

const toRow = (t) => ({
  term: t.term,
  definition: t.definition,
  learned_on: t.learned_on,
  ...(t.manual ? { domain_id: domains.get(t.domain), domain_source: "manual" } : {}),
});

// Hand-filed terms go first: the classifier's centroids need them before it can judge the rest.
let placed = 0;
for (const [label, group] of [
  ["dipilah manual", wanted.filter((t) => t.manual)],
  ["untuk ditebak sistem", wanted.filter((t) => !t.manual)],
]) {
  for (const batch of chunks(group, 100)) {
    const rows = await insert("vocab_terms", batch.map(toRow));
    const result = await embed({ termIds: rows.map((r) => r.id) });
    placed += result.placed ?? 0;
  }
  console.log(`${group.length} istilah ${label}.`);
}

const sources = await rest("vocab_terms?select=domain_source,map_placed&deleted_at=is.null&limit=1000");
const count = (key, value) => sources.filter((r) => r[key] === value).length;
console.log(
  `Total ${sources.length} istilah: ${count("domain_source", "manual")} manual, ${count("domain_source", "auto")} otomatis, ` +
    `${count("domain_source", "pending")} menunggu domain. ${placed} ditempatkan di peta lewat kNN, ` +
    `${count("map_placed", null)} belum punya posisi (tekan "Susun peta" di /vocab/map).`,
);
