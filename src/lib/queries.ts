import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SubjectRef, TopicRef } from "./types";

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
