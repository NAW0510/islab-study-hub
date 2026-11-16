/**
 * vocab-embed — embeds vocabulary terms and domain prototypes, then guesses
 * each term's domain. Spec: docs/SPEC_KOSAKATA_PETA_OTAK.md §3.3 and §6.
 *
 * POST { termIds?: string[], domainIds?: string[], mode?: "embed" | "reclassify" }
 *
 * Security: the caller's JWT is verified and every query runs through a client
 * scoped to that user, so Row Level Security decides what can be read or
 * written. No secret / service-role key is used anywhere in this function.
 *
 * After classification, terms that have no position on the brain map yet are
 * placed next to their nearest already-placed neighbours (spec §4.2).
 *
 * Failure model: whatever was saved stays saved. Problems are reported in
 * `errors` with HTTP 200, so the app can keep the term as "belum diproses"
 * and offer a retry.
 */
import { createContextClient, verifyAuth } from "npm:@supabase/server@1.9.2/core";
import { placeByNeighbors, type PlacedNeighbor } from "../_shared/knn-place.ts";
import { decide, type Decision, type DomainSimilarity } from "../_shared/vocab-classify.ts";
import { VOCAB_CONFIG } from "../_shared/vocab-config.ts";
import { domainPrototypeText, termText } from "../_shared/vocab-text.ts";
import { embedTexts } from "../_shared/voyage.ts";

type Supabase = ReturnType<typeof createContextClient>;

type TermRow = {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
  domain_id: string | null;
  domain_source: "pending" | "auto" | "confirmed" | "manual";
  embedded_at: string | null;
  updated_at: string;
};

type DomainRow = { id: string; name: string; description: string; updated_at: string };

type SuggestRow = {
  term_id: string;
  domain_id: string;
  parent_id: string | null;
  proto_sim: number;
  centroid_sim: number | null;
};

type TermResult = {
  id: string;
  domain_id: string | null;
  domain_source: TermRow["domain_source"];
  confidence: Decision["confidence"] | null;
  top: Decision["top"];
};

type NeighborRow = { term_id: string; similarity: number; map_x: number; map_y: number };

type StageError = { stage: "domains" | "embed" | "save" | "classify" | "place"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERM_COLUMNS = "id, term, aliases, definition, domain_id, domain_source, embedded_at, updated_at";
/** PostgREST returns at most 1000 rows per request by default. */
const MAX_ROWS = 1000;
const EMBED_TIMEOUT_MS = 8000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function idList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && UUID.test(v))) return null;
  return [...new Set(value as string[])];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Up to PROTOTYPE_EXAMPLES confirmed/manual terms per domain, oldest first (stable). */
async function examplesByDomain(supabase: Supabase, domainIds: string[]) {
  const examples = new Map<string, string[]>();
  if (domainIds.length === 0) return examples;
  const { data, error } = await supabase
    .from("vocab_terms")
    .select("term, domain_id")
    .in("domain_id", domainIds)
    .in("domain_source", ["confirmed", "manual"])
    .is("deleted_at", null)
    .order("created_at")
    .limit(MAX_ROWS);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { term: string; domain_id: string }[]) {
    const list = examples.get(row.domain_id) ?? [];
    if (list.length < VOCAB_CONFIG.PROTOTYPE_EXAMPLES) list.push(row.term);
    examples.set(row.domain_id, list);
  }
  return examples;
}

/** Scores and decisions for the given terms; rows are fetched in chunks that fit one response. */
async function classify(supabase: Supabase, termIds: string[], domainCount: number) {
  const decisions = new Map<string, Decision>();
  const perRequest = Math.max(1, Math.floor(MAX_ROWS / Math.max(domainCount, 1)));

  for (const ids of chunk(termIds, perRequest)) {
    const { data, error } = await supabase.rpc("suggest_vocab_domains", {
      p_term_ids: ids,
      p_min_terms: VOCAB_CONFIG.CENTROID_MIN_TERMS,
    });
    if (error) throw new Error(error.message);

    const byTerm = new Map<string, DomainSimilarity[]>();
    for (const row of (data ?? []) as SuggestRow[]) {
      const list = byTerm.get(row.term_id) ?? [];
      list.push({ domainId: row.domain_id, parentId: row.parent_id, protoSim: row.proto_sim, centroidSim: row.centroid_sim });
      byTerm.set(row.term_id, list);
    }
    // A term with no rows (no domain has a prototype yet) simply stays pending.
    for (const id of ids) decisions.set(id, decide(byTerm.get(id) ?? []));
  }

  const items = [...decisions].map(([id, d]) => ({
    id,
    domain_id: d.domainId,
    domain_source: d.source,
    domain_scores: d.top,
  }));
  for (const part of chunk(items, 500)) {
    const { error } = await supabase.rpc("save_vocab_classification", { p_items: part });
    if (error) throw new Error(error.message);
  }
  return decisions;
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Gunakan metode POST." }, 405);

  const { data: auth, error: authError } = await verifyAuth(req, { auth: "user" });
  if (authError || !auth?.token) {
    return json({ error: authError?.message ?? "Tidak terautentikasi." }, authError?.status ?? 401);
  }
  const supabase = createContextClient({ auth: { token: auth.token, keyName: auth.keyName } });

  let body: { termIds?: unknown; domainIds?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body harus JSON." }, 400);
  }
  const mode = body.mode === undefined ? "embed" : body.mode;
  const termIds = idList(body.termIds);
  const domainIds = idList(body.domainIds);
  if (mode !== "embed" && mode !== "reclassify") return json({ error: "mode harus 'embed' atau 'reclassify'." }, 400);
  if (!termIds || !domainIds) return json({ error: "termIds dan domainIds harus berupa daftar UUID." }, 400);
  if (termIds.length + domainIds.length > VOCAB_CONFIG.MAX_IDS_PER_REQUEST) {
    return json({ error: `Maksimal ${VOCAB_CONFIG.MAX_IDS_PER_REQUEST} id per permintaan.` }, 400);
  }

  const errors: StageError[] = [];
  const embedded = { terms: 0, domains: 0 };

  // ── 1. Which rows need a (new) embedding? ─────────────────────────────
  let domains: DomainRow[] = [];
  let terms: TermRow[] = [];
  try {
    // Domains: the requested ones without a prototype; on reclassify, every
    // active domain, so prototypes pick up the current example terms.
    let domainQuery = supabase.from("vocab_domains").select("id, name, description, updated_at").is("deleted_at", null);
    if (mode === "embed") domainQuery = domainQuery.in("id", domainIds).is("embedding", null);
    if (mode === "reclassify" || domainIds.length > 0) {
      const { data, error } = await domainQuery.limit(MAX_ROWS);
      if (error) throw new Error(error.message);
      domains = (data ?? []) as DomainRow[];
    }

    if (mode === "embed" && termIds.length > 0) {
      const { data, error } = await supabase.from("vocab_terms").select(TERM_COLUMNS).in("id", termIds).is("deleted_at", null);
      if (error) throw new Error(error.message);
      terms = (data ?? []) as TermRow[];
    }
  } catch (error) {
    return json({ error: `Gagal membaca data: ${(error as Error).message}` }, 500);
  }

  // ── 2. One batch request to the embedding provider ────────────────────
  const termsToEmbed = terms.filter((t) => t.embedded_at === null);
  if (domains.length + termsToEmbed.length > 0) {
    try {
      const examples = await examplesByDomain(supabase, domains.map((d) => d.id));
      const texts = [
        ...domains.map((d) => domainPrototypeText({ name: d.name, description: d.description, examples: examples.get(d.id) })),
        ...termsToEmbed.map((t) => termText(t)),
      ];
      const vectors = await embedTexts(texts, {
        apiKey: Deno.env.get("VOYAGE_API_KEY") ?? "",
        apiUrl: Deno.env.get("VOYAGE_API_URL") || undefined,
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      });

      // ── 3. Save. Rows edited meanwhile are skipped by the RPC (seen_at). ─
      const model = VOCAB_CONFIG.EMBEDDING_MODEL;
      try {
        if (domains.length > 0) {
          const { data, error } = await supabase.rpc("save_vocab_embeddings", {
            p_kind: "domain",
            p_items: domains.map((d, i) => ({ id: d.id, embedding: vectors[i], model, seen_at: d.updated_at })),
          });
          if (error) throw new Error(error.message);
          embedded.domains = (data as number) ?? 0;
        }
        if (termsToEmbed.length > 0) {
          const offset = domains.length;
          const { data, error } = await supabase.rpc("save_vocab_embeddings", {
            p_kind: "term",
            p_items: termsToEmbed.map((t, i) => ({ id: t.id, embedding: vectors[offset + i], model, seen_at: t.updated_at })),
          });
          if (error) throw new Error(error.message);
          embedded.terms = (data as number) ?? 0;
        }
      } catch (error) {
        errors.push({ stage: "save", message: (error as Error).message });
      }
    } catch (error) {
      errors.push({ stage: "embed", message: (error as Error).message });
    }
  }

  // ── 4. Classify terms the system may still change (pending / auto) ────
  const results: TermResult[] = [];
  try {
    let classifiable: { id: string }[];
    if (mode === "reclassify") {
      const { data, error } = await supabase
        .from("vocab_terms")
        .select("id")
        .in("domain_source", ["pending", "auto"])
        .not("embedded_at", "is", null)
        .is("deleted_at", null)
        .order("created_at")
        .limit(5000);
      if (error) throw new Error(error.message);
      classifiable = (data ?? []) as { id: string }[];
    } else {
      // Read again: embeddings saved in step 3 change which terms qualify.
      const candidates = terms.filter((t) => t.domain_source === "pending" || t.domain_source === "auto").map((t) => t.id);
      classifiable = [];
      if (candidates.length > 0) {
        const { data, error } = await supabase
          .from("vocab_terms")
          .select("id")
          .in("id", candidates)
          .in("domain_source", ["pending", "auto"])
          .not("embedded_at", "is", null)
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        classifiable = (data ?? []) as { id: string }[];
      }
    }

    const { count: domainCount, error: countError } = await supabase
      .from("vocab_domains")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (countError) throw new Error(countError.message);

    const decisions = await classify(supabase, classifiable.map((t) => t.id), domainCount ?? 0);

    const known = new Map(terms.map((t) => [t.id, t]));
    for (const [id, decision] of decisions) {
      results.push({ id, domain_id: decision.domainId, domain_source: decision.source, confidence: decision.confidence, top: decision.top });
      known.delete(id);
    }
    // Requested terms that were not classified: the user's own choices, or terms still without an embedding.
    for (const term of known.values()) {
      results.push({ id: term.id, domain_id: term.domain_id, domain_source: term.domain_source, confidence: null, top: [] });
    }
  } catch (error) {
    errors.push({ stage: "classify", message: (error as Error).message });
  }

  // ── 5. Put new terms on the map next to their nearest placed neighbours ─
  // Only terms without a position are touched (the RPC enforces it too), so a
  // layout is never disturbed. Without any placed neighbour the term simply
  // waits for the first "Susun peta".
  let placed = 0;
  if (mode === "embed" && terms.length > 0) {
    try {
      const { data: unplaced, error: unplacedError } = await supabase
        .from("vocab_terms")
        .select("id")
        .in("id", terms.map((t) => t.id))
        .is("map_x", null)
        .not("embedded_at", "is", null)
        .is("deleted_at", null);
      if (unplacedError) throw new Error(unplacedError.message);

      const ids = ((unplaced ?? []) as { id: string }[]).map((t) => t.id);
      if (ids.length > 0) {
        const { data, error } = await supabase.rpc("vocab_knn_neighbors", {
          p_term_ids: ids,
          p_k: VOCAB_CONFIG.KNN_PLACEMENT_K,
        });
        if (error) throw new Error(error.message);

        const byTerm = new Map<string, PlacedNeighbor[]>();
        for (const row of (data ?? []) as NeighborRow[]) {
          const list = byTerm.get(row.term_id) ?? [];
          list.push({ similarity: row.similarity, x: row.map_x, y: row.map_y });
          byTerm.set(row.term_id, list);
        }
        const items = ids.flatMap((id) => {
          const position = placeByNeighbors(id, byTerm.get(id) ?? []);
          return position ? [{ id, x: position.x, y: position.y }] : [];
        });
        if (items.length > 0) {
          const { data: saved, error: saveError } = await supabase.rpc("save_vocab_placements", { p_items: items });
          if (saveError) throw new Error(saveError.message);
          placed = (saved as number) ?? 0;
        }
      }
    } catch (error) {
      errors.push({ stage: "place", message: (error as Error).message });
    }
  }

  return json({ terms: results, embedded, placed, errors });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error("vocab-embed:", (error as Error).message);
    return json({ error: "Terjadi kesalahan di server." }, 500);
  }
});
