"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VOCAB_CONFIG } from "../../../supabase/functions/_shared/vocab-config.ts";
import { requireUser } from "../auth";
import { missingExtraDomains, VOCAB_TERM_COLUMNS } from "../queries";
import type { ActionResult, VocabTerm } from "../types";
import { todayISO } from "../utils";
import { parseBulk } from "../vocab/parse-bulk";
import { asDomainColor, SEED_DOMAINS } from "../vocab/seed-domains";
import { dbError, optDate, optStr, str } from "./form";
import { resolveSubjectAndTopic } from "./refs";

/**
 * Server Actions for the Kosakata feature. Every write goes through RLS as the
 * signed-in user; the vocab-embed Edge Function (same JWT) handles embeddings
 * and classification.
 *
 * Embedding failures NEVER fail the action: the term stays saved as "belum
 * diproses" and the UI offers a retry (spec §3.2).
 */

const EMBED_TIMEOUT_MS = 10_000;

type EmbedOutcome = "ok" | "failed";

async function invokeEmbed(
  supabase: SupabaseClient,
  body: { termIds?: string[]; domainIds?: string[]; mode?: "embed" | "reclassify" },
): Promise<EmbedOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke("vocab-embed", { body, timeout: EMBED_TIMEOUT_MS });
    if (error) return "failed";
    // A failed map placement is not a failed embedding: the term is processed and
    // simply gets its position at the next "Susun ulang".
    const errors = ((data?.errors ?? []) as { stage?: string }[]).filter((e) => e.stage !== "place");
    return errors.length > 0 ? "failed" : "ok";
  } catch {
    return "failed";
  }
}

function vocabDbError(error: { code?: string; message: string }): { error: string } {
  if (error.code === "23505") return { error: "Istilah atau nama itu sudah ada di Kosakata." };
  // Trigger messages (ownership, hierarchy) are written for people; show them as they are.
  if (error.code === "23514" || error.code === "23503") return { error: error.message };
  return dbError(error);
}

/** Comma-separated aliases → clean array (reuses the tag parser's splitting, keeps case). */
function parseAliases(input: string): string[] {
  const aliases = input
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
  return [...new Set(aliases)].slice(0, 12);
}

// ── Terms ──────────────────────────────────────────────────────────────────

export type SaveTermResult = { error: string } | { term: VocabTerm; embed: EmbedOutcome };

export async function createTerm(formData: FormData): Promise<SaveTermResult> {
  const { supabase } = await requireUser();

  const term = str(formData, "term").replace(/\s+/g, " ");
  if (!term) return { error: "Istilah wajib diisi." };
  if (term.length > 120) return { error: "Istilah maksimal 120 karakter." };

  const domainId = optStr(formData, "domain_id");
  const refs = await resolveSubjectAndTopic(supabase, optStr(formData, "subject_id"), optStr(formData, "syllabus_item_id"));
  const row = {
    term,
    definition: str(formData, "definition"),
    aliases: parseAliases(str(formData, "aliases")),
    learned_on: optDate(formData, "learned_on") ?? todayISO(),
    domain_id: domainId,
    domain_source: domainId ? ("manual" as const) : ("pending" as const),
    ...refs,
  };

  const { data, error } = await supabase.from("vocab_terms").insert(row).select("*").single();
  if (error) return vocabDbError(error);

  const embed = await invokeEmbed(supabase, { termIds: [data.id] });
  revalidatePath("/", "layout");

  const { data: fresh } = await supabase.from("vocab_terms").select("*").eq("id", data.id).single();
  return { term: (fresh ?? data) as VocabTerm, embed };
}

export type BulkResult = { error: string } | { inserted: number; skipped: number; embed: EmbedOutcome };

/** Paste many terms at once: one per line (see parse-bulk.ts). One embedding batch. */
export async function createTermsBulk(formData: FormData): Promise<BulkResult> {
  const { supabase } = await requireUser();

  const text = str(formData, "lines");
  if (!text) return { error: "Tempel minimal satu baris." };

  const { data: existing, error: readError } = await supabase
    .from("vocab_terms")
    .select("term, aliases")
    .is("deleted_at", null);
  if (readError) return dbError(readError);

  const taken = (existing ?? []).flatMap((r) => [r.term, ...((r.aliases as string[]) ?? [])]);
  const rows = parseBulk(text, taken).rows.filter((r) => r.ok);
  if (rows.length === 0) return { error: "Tidak ada baris baru yang bisa disimpan." };

  const learnedOn = optDate(formData, "learned_on") ?? todayISO();
  const { data, error } = await supabase
    .from("vocab_terms")
    .insert(rows.map((r) => ({ term: r.term, definition: r.definition, learned_on: learnedOn })))
    .select("id");
  if (error) return vocabDbError(error);

  const embed = await invokeEmbed(supabase, { termIds: (data ?? []).map((r) => r.id) });
  revalidatePath("/", "layout");
  return { inserted: data?.length ?? 0, skipped: parseBulk(text, taken).rows.length - rows.length, embed };
}

export async function updateTerm(id: string, formData: FormData): Promise<SaveTermResult> {
  const { supabase } = await requireUser();

  const term = str(formData, "term").replace(/\s+/g, " ");
  if (!term) return { error: "Istilah wajib diisi." };

  const { data: before, error: beforeError } = await supabase
    .from("vocab_terms")
    .select("domain_id, domain_source")
    .eq("id", id)
    .single();
  if (beforeError) return dbError(beforeError);

  // A domain picked in the edit form is the user's own choice; keeping the
  // previous one keeps the previous status.
  const domainId = optStr(formData, "domain_id");
  const refs = await resolveSubjectAndTopic(supabase, optStr(formData, "subject_id"), optStr(formData, "syllabus_item_id"));
  const patch = {
    term,
    definition: str(formData, "definition"),
    aliases: parseAliases(str(formData, "aliases")),
    learned_on: optDate(formData, "learned_on") ?? todayISO(),
    domain_id: domainId,
    domain_source:
      domainId === before.domain_id ? (domainId ? before.domain_source : ("pending" as const)) : domainId ? ("manual" as const) : ("pending" as const),
    ...refs,
  };

  const { error } = await supabase.from("vocab_terms").update(patch).eq("id", id);
  if (error) return vocabDbError(error);

  // Re-embed when the text changed (the trigger cleared the embedding), and
  // reclassify when the term is still the system's to assign.
  const embed = await invokeEmbed(supabase, { termIds: [id] });
  revalidatePath("/", "layout");

  const { data: fresh, error: freshError } = await supabase.from("vocab_terms").select("*").eq("id", id).single();
  if (freshError) return dbError(freshError);
  return { term: fresh as VocabTerm, embed };
}

/** "Benar" on an automatic guess: the choice becomes the user's. */
export async function confirmTermDomain(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("vocab_terms")
    .update({ domain_source: "confirmed" })
    .eq("id", id)
    .eq("domain_source", "auto");
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

/** Pick a domain by hand (or null to put the term back in the review queue). */
export async function setTermDomain(id: string, domainId: string | null): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("vocab_terms")
    .update(domainId ? { domain_id: domainId, domain_source: "manual" } : { domain_id: null, domain_source: "pending" })
    .eq("id", id);
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

/**
 * Several domains at once for a pending term (one term, many domains): the
 * first becomes the primary one, the rest are extras. All the user's choice.
 */
export async function assignTermDomains(id: string, domainIds: string[]): Promise<ActionResult> {
  const unique = [...new Set(domainIds)];
  if (unique.length === 0) return { error: "Pilih minimal satu domain." };
  const { supabase } = await requireUser();
  const [primary, ...extras] = unique;
  const { error } = await supabase.from("vocab_terms").update({ domain_id: primary, domain_source: "manual" }).eq("id", id);
  if (error) return vocabDbError(error);
  if (extras.length > 0) {
    const { error: extraError } = await supabase
      .from("vocab_term_domains")
      .upsert(extras.map((domainId) => ({ term_id: id, domain_id: domainId })), { onConflict: "term_id,domain_id", ignoreDuplicates: true });
    if (extraError) return vocabDbError(extraError);
  }
  revalidatePath("/", "layout");
}

/** Attach one more domain to a term ("Juga cocok di …", or picked by hand). */
export async function addTermDomain(id: string, domainId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("vocab_term_domains").insert({ term_id: id, domain_id: domainId });
  if (error) {
    if (error.code === "23505") return { error: "Domain itu sudah terpasang di istilah ini." };
    return vocabDbError(error);
  }
  revalidatePath("/", "layout");
}

/** Take an extra domain off a term (its primary domain stays). */
export async function removeTermDomain(id: string, domainId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("vocab_term_domains").delete().eq("term_id", id).eq("domain_id", domainId);
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

/** Swap: an extra domain becomes the primary one, the old primary becomes an extra. */
export async function makePrimaryDomain(id: string, domainId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("make_primary_vocab_domain", { p_term_id: id, p_domain_id: domainId });
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

export async function deleteTerm(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("vocab_terms").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

/** Undo for deleteTerm (the toast's "Urungkan"). */
export async function restoreTerm(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("vocab_terms").update({ deleted_at: null }).eq("id", id);
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

export type NearestTerm = { id: string; term: string; domain_id: string | null; similarity: number };

/** The most similar other terms, from the real embeddings (drawer). */
export async function nearestTerms(id: string): Promise<{ error: string } | { terms: NearestTerm[] }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("match_vocab_terms", { p_term_id: id, p_count: 6 });
  if (error) return dbError(error);
  return { terms: (data ?? []) as NearestTerm[] };
}

/** Full term plus its nearest neighbours, for the brain map's detail panel (the map itself only loads snippets). */
export async function termDetail(id: string): Promise<{ error: string } | { term: VocabTerm; neighbours: NearestTerm[] }> {
  const { supabase } = await requireUser();
  const one = (columns: string) => supabase.from("vocab_terms").select(columns).eq("id", id).is("deleted_at", null).single();
  const [firstTry, nearRes] = await Promise.all([one(VOCAB_TERM_COLUMNS), supabase.rpc("match_vocab_terms", { p_term_id: id, p_count: 6 })]);
  // Until the extra-domains migration reaches the database, read the term without them.
  const termRes = missingExtraDomains(firstTry.error) ? await one("*") : firstTry;
  if (termRes.error) return dbError(termRes.error);
  return { term: termRes.data as unknown as VocabTerm, neighbours: (nearRes.data ?? []) as NearestTerm[] };
}

/** Embeds everything that is still "belum diproses" (after a failure or wrong key). */
export async function retryPending(): Promise<{ error: string } | { queued: number; embed: EmbedOutcome }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("vocab_terms")
    .select("id")
    .is("embedded_at", null)
    .is("deleted_at", null)
    .order("created_at")
    .limit(VOCAB_CONFIG.MAX_IDS_PER_REQUEST);
  if (error) return dbError(error);

  const { data: domains, error: domainError } = await supabase
    .from("vocab_domains")
    .select("id")
    .is("embedding", null)
    .is("deleted_at", null)
    .limit(20);
  if (domainError) return dbError(domainError);

  const termIds = (data ?? []).map((r) => r.id).slice(0, VOCAB_CONFIG.MAX_IDS_PER_REQUEST - (domains?.length ?? 0));
  if (termIds.length === 0 && (domains?.length ?? 0) === 0) return { queued: 0, embed: "ok" };

  const embed = await invokeEmbed(supabase, { termIds, domainIds: (domains ?? []).map((d) => d.id) });
  revalidatePath("/", "layout");
  return { queued: termIds.length, embed };
}

/** Re-runs the decision rule for every pending/auto term (never confirmed/manual). */
export async function reclassifyAuto(): Promise<{ error: string } | { embed: EmbedOutcome }> {
  const { supabase } = await requireUser();
  const embed = await invokeEmbed(supabase, { mode: "reclassify" });
  revalidatePath("/", "layout");
  return { embed };
}

// ── Domains ────────────────────────────────────────────────────────────────

export async function createDomain(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const name = str(formData, "name");
  if (!name) return { error: "Nama domain wajib diisi." };

  const { data, error } = await supabase
    .from("vocab_domains")
    .insert({
      name,
      description: str(formData, "description"),
      color: asDomainColor(str(formData, "color")),
      parent_id: optStr(formData, "parent_id"),
    })
    .select("id")
    .single();
  if (error) return vocabDbError(error);

  await invokeEmbed(supabase, { domainIds: [data.id] });
  revalidatePath("/", "layout");
}

export async function updateDomain(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const name = str(formData, "name");
  if (!name) return { error: "Nama domain wajib diisi." };

  const { error } = await supabase
    .from("vocab_domains")
    .update({
      name,
      description: str(formData, "description"),
      color: asDomainColor(str(formData, "color")),
      parent_id: optStr(formData, "parent_id"),
    })
    .eq("id", id);
  if (error) return vocabDbError(error);

  // The trigger cleared the prototype if name/description changed; rebuild it.
  await invokeEmbed(supabase, { domainIds: [id] });
  revalidatePath("/", "layout");
}

export async function mergeDomains(fromId: string, intoId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("merge_vocab_domains", { p_from: fromId, p_into: intoId });
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

export async function deleteDomain(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_vocab_domain", { p_id: id });
  if (error) return vocabDbError(error);
  revalidatePath("/", "layout");
}

/** Creates the starter domains picked in the onboarding (spec §3.5). */
export async function seedDomains(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const picked = SEED_DOMAINS.filter((d) => formData.get(`pick-${d.key}`) === "on");
  if (picked.length === 0) return { error: "Pilih minimal satu domain." };

  const nameOf = (d: (typeof SEED_DOMAINS)[number]) => (str(formData, `name-${d.key}`) || d.name).slice(0, 60);
  const descOf = (d: (typeof SEED_DOMAINS)[number]) => str(formData, `desc-${d.key}`) || d.description;

  // Fields first, then branches pointing at the created ids.
  const fields = picked.filter((d) => !d.parent || !picked.some((p) => p.key === d.parent));
  const branches = picked.filter((d) => !fields.includes(d));

  const { data: created, error } = await supabase
    .from("vocab_domains")
    .insert(fields.map((d) => ({ name: nameOf(d), description: descOf(d), color: d.color })))
    .select("id, name");
  if (error) return vocabDbError(error);

  const idByName = new Map((created ?? []).map((d) => [d.name, d.id]));
  let branchIds: string[] = [];
  if (branches.length > 0) {
    const { data: createdBranches, error: branchError } = await supabase
      .from("vocab_domains")
      .insert(
        branches.map((d) => {
          const parentSeed = SEED_DOMAINS.find((p) => p.key === d.parent);
          const parentName = parentSeed ? nameOf(parentSeed) : "";
          return { name: nameOf(d), description: descOf(d), color: d.color, parent_id: idByName.get(parentName) ?? null };
        }),
      )
      .select("id");
    if (branchError) return vocabDbError(branchError);
    branchIds = (createdBranches ?? []).map((d) => d.id);
  }

  await invokeEmbed(supabase, { domainIds: [...(created ?? []).map((d) => d.id), ...branchIds] });
  revalidatePath("/", "layout");
}
