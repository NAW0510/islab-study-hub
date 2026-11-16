import type { Metadata } from "next";
import { DomainOnboarding } from "@/components/vocab/domain-onboarding";
import { VocabBrowser } from "@/components/vocab/vocab-browser";
import { requireUser } from "@/lib/auth";
import { getProfile, getSubjectsAndTopics } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { VocabDomain, VocabTerm } from "@/lib/types";

export const metadata: Metadata = { title: "Kosakata" };

const TERM_COLUMNS =
  "id, term, aliases, definition, learned_on, domain_id, domain_source, domain_scores, subject_id, syllabus_item_id, note_id, embedded_at, created_at, updated_at";

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  // Everything loads once (no vectors); search and filters run in the browser.
  const [termsRes, domainsRes, profile, { subjects, topics }] = await Promise.all([
    supabase
      .from("vocab_terms")
      .select(TERM_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    getProfile(supabase),
    getSubjectsAndTopics(supabase),
  ]);

  const terms = (termsRes.data ?? []) as VocabTerm[];
  const domains = (domainsRes.data ?? []) as VocabDomain[];

  if (terms.length === 0 && domains.length === 0) {
    return <DomainOnboarding />;
  }

  const initial = { q: one(sp.q), domain: one(sp.domain), status: one(sp.status), sort: one(sp.sort) };
  return (
    <VocabBrowser
      key={JSON.stringify(initial)}
      terms={terms}
      domains={domains}
      subjects={subjects}
      topics={topics}
      programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
      initial={initial}
    />
  );
}
