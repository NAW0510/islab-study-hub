import type { Metadata } from "next";
import { LanguageBrowser } from "@/components/study/language-browser";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import { loadStudy } from "@/lib/study/queries";

export const metadata: Metadata = { title: "Bahasa · Ruang Studi" };

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/** Ruang Studi › Bahasa: the diksi of every language, and the languages themselves. */
export default async function LanguagesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const [study, profile] = await Promise.all([loadStudy(supabase), getProfile(supabase)]);
  const initial = { bahasa: one(sp.bahasa), q: one(sp.q) };
  return (
    <LanguageBrowser
      key={JSON.stringify(initial)}
      languages={study.languages}
      words={study.words}
      missing={study.missing}
      programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
      initial={initial}
    />
  );
}
