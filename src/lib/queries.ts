import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SubjectRef, TopicRef } from "./types";

/** Every vocab_terms column the Kosakata pages show (no vectors, no map columns). */
const VOCAB_TERM_BASE_COLUMNS =
  "id, term, aliases, definition, learned_on, domain_id, domain_source, domain_scores, subject_id, syllabus_item_id, note_id, embedded_at, created_at, updated_at";
/** …plus the extra domains of each term (one term, many domains). */
export const VOCAB_TERM_COLUMNS = `${VOCAB_TERM_BASE_COLUMNS}, extra_domains:vocab_term_domains(domain_id, created_at)`;

/**
 * True when a query failed only because the database does not have
 * vocab_term_domains yet (its migration not pushed): the caller can read the
 * terms without their extra domains instead of failing the page.
 */
export const missingExtraDomains = (error: { code?: string } | null) => error?.code === "PGRST200" || error?.code === "42P01";

/** The user's active terms, newest first, with their extra domains when the database has them. */
export async function loadVocabTerms(supabase: SupabaseClient, limit = 1000) {
  const query = (columns: string) =>
    supabase.from("vocab_terms").select(columns).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
  const result = await query(VOCAB_TERM_COLUMNS);
  return missingExtraDomains(result.error) ? query(VOCAB_TERM_BASE_COLUMNS) : result;
}

/** Select strings that embed the linked subject and syllabus topic. */

export const NOTE_SELECT = "*, subject:subjects(id, title, color), topic:syllabus_items(id, title)";
export const RESOURCE_SELECT = "*, subject:subjects(id, title, color), topic:syllabus_items(id, title)";

/** Options for the subject/topic pickers in note & resource forms. */
export async function getSubjectsAndTopics(supabase: SupabaseClient) {
  const [subjects, topics] = await Promise.all([
    supabase.from("subjects").select("id, title, color").order("title"),
    supabase.from("syllabus_items").select("id, title, subject_id").order("position"),
  ]);
  return {
    subjects: (subjects.data ?? []) as SubjectRef[],
    topics: (topics.data ?? []) as TopicRef[],
  };
}

/** Counts rows per key, e.g. notes per subject_id. */
export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    if (k) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * The signed-in user's profile. Cached per request (the client from
 * `requireUser()` is the cache key), so the app layout and the page it wraps
 * share one query.
 */
export const getProfile = cache(async (supabase: SupabaseClient) => {
  const { data } = await supabase.from("profiles").select("*").maybeSingle();
  return (data ?? null) as Profile | null;
});
