import type { Metadata } from "next";
import { DomainManager } from "@/components/vocab/domain-manager";
import { requireUser } from "@/lib/auth";
import { countBy } from "@/lib/queries";
import type { VocabDomain } from "@/lib/types";

export const metadata: Metadata = { title: "Kelola domain" };

export default async function VocabDomainsPage() {
  const { supabase } = await requireUser();

  const [domainsRes, termsRes] = await Promise.all([
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    supabase.from("vocab_terms").select("domain_id").is("deleted_at", null).not("domain_id", "is", null),
  ]);

  return (
    <DomainManager
      domains={(domainsRes.data ?? []) as VocabDomain[]}
      termCounts={countBy((termsRes.data ?? []) as { domain_id: string | null }[], (r) => r.domain_id)}
    />
  );
}
