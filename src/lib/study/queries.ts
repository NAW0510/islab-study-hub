import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyLanguage, StudyWord } from "../types";

const LANGUAGE_COLUMNS = "id, name, code, countries, color, created_at, updated_at";
const WORD_COLUMNS = "id, language_id, word, reading, meaning, example, notes, region, learned_on, created_at, updated_at";

export type StudyData = {
  languages: StudyLanguage[];
  words: StudyWord[];
  /** The tables are not in this database yet (the migration has not reached it): everything reads as empty. */
  missing: boolean;
};

/**
 * Every live language (oldest first, the order they were added) and word
 * (newest first). Light enough for the Bahasa page and the Perpustakaan's
 * atlas. A database without the Bahasa tables reads as empty instead of
 * breaking the Ruang Studi.
 */
export async function loadStudy(supabase: SupabaseClient): Promise<StudyData> {
  const [languages, words] = await Promise.all([
    supabase.from("study_languages").select(LANGUAGE_COLUMNS).is("deleted_at", null).order("created_at"),
    supabase
      .from("study_words")
      .select(WORD_COLUMNS)
      .is("deleted_at", null)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const missing = [languages.error, words.error].some((e) => e && (e.code === "42P01" || e.code === "PGRST205"));
  return {
    languages: (languages.data ?? []) as StudyLanguage[],
    words: (words.data ?? []) as StudyWord[],
    missing,
  };
}
