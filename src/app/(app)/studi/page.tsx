import type { Metadata } from "next";
import { LibraryPage } from "@/components/vocab/library/library-page";
import { requireUser } from "@/lib/auth";
import { getProfile, getSubjectsAndTopics, loadVocabTerms } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import { loadStudy } from "@/lib/study/queries";
import type { VocabDomain, VocabTerm } from "@/lib/types";

export const metadata: Metadata = { title: "Perpustakaan · Ruang Studi" };

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/** Ruang Studi: straight into the Perpustakaan (its books, Istilah Teknis' shelf, the Bahasa atlas). */
export default async function StudyRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  // The same light read as the Daftar page; search, fields, rooms and term pages all run in the browser.
  const [termsRes, domainsRes, profile, { subjects, topics }, study] = await Promise.all([
    loadVocabTerms(supabase),
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    getProfile(supabase),
    getSubjectsAndTopics(supabase),
    loadStudy(supabase),
  ]);
  const terms = (termsRes.data ?? []) as unknown as VocabTerm[];

  // Titles of the notes the terms point to, for the term pages' links.
  const noteIds = [...new Set(terms.map((t) => t.note_id).filter((id): id is string => Boolean(id)))];
  const notes = noteIds.length
    ? (((await supabase.from("notes").select("id, title").in("id", noteIds)).data ?? []) as { id: string; title: string }[])
    : [];

  const initial = { q: one(sp.q), domain: one(sp.domain) };
  return (
    <LibraryPage
      key={JSON.stringify(initial)}
      terms={terms}
      domains={(domainsRes.data ?? []) as VocabDomain[]}
      subjects={subjects}
      topics={topics}
      notes={notes}
      programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
      initial={initial}
      languages={{ languages: study.languages, words: study.words }}
    />
  );
}
