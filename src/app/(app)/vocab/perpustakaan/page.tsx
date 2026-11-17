import type { Metadata } from "next";
import { LibraryPage } from "@/components/vocab/library/library-page";
import { requireUser } from "@/lib/auth";
import { getProfile, VOCAB_TERM_COLUMNS } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { VocabDomain, VocabTerm } from "@/lib/types";

export const metadata: Metadata = { title: "Perpustakaan · Kosakata" };

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export default async function LibraryRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  // The same light read as the Daftar page; search and the field filter run in the browser.
  const [termsRes, domainsRes, profile] = await Promise.all([
    supabase
      .from("vocab_terms")
      .select(VOCAB_TERM_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    getProfile(supabase),
  ]);

  const initial = { q: one(sp.q), domain: one(sp.domain) };
  return (
    <LibraryPage
      key={JSON.stringify(initial)}
      terms={(termsRes.data ?? []) as VocabTerm[]}
      domains={(domainsRes.data ?? []) as VocabDomain[]}
      programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
      initial={initial}
    />
  );
}
