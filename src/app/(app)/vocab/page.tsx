import type { Metadata } from "next";
import { DomainOnboarding } from "@/components/vocab/domain-onboarding";
import { VocabBrowser } from "@/components/vocab/vocab-browser";
import { requireUser } from "@/lib/auth";
import { getProfile, getSubjectsAndTopics, VOCAB_TERM_COLUMNS } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { VocabDomain, VocabTerm } from "@/lib/types";

export const metadata: Metadata = { title: "Kosakata" };

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
      .select(VOCAB_TERM_COLUMNS)
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

  const filters = { q: one(sp.q), domain: one(sp.domain), status: one(sp.status), topic: one(sp.topic), sort: one(sp.sort) };
  const initial = { ...filters, term: one(sp.term), view: one(sp.view) === "kartu" ? "kartu" : undefined };
  return (
    <VocabBrowser
      // A new filter set from a link starts the browser afresh. The open term and the
      // view change inside the page, so a refresh after an edit keeps the drawer open.
      key={JSON.stringify(filters)}
      terms={terms}
      domains={domains}
      subjects={subjects}
      topics={topics}
      programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
      initial={initial}
    />
  );
}
