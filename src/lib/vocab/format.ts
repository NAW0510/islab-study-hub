import { CONFIDENCE_LABELS, confidenceFromStored } from "../../../supabase/functions/_shared/vocab-classify.ts";
import type { DomainSource, VocabDomain, VocabTerm } from "../types";

/** Display helpers shared by the vocab list, drawer and domain manager. */

export const DOMAIN_SOURCE_LABELS: Record<DomainSource, string> = {
  pending: "Menunggu domain",
  auto: "Otomatis",
  confirmed: "Dikonfirmasi",
  manual: "Manual",
};

export type DomainIndex = Map<string, VocabDomain>;

export const domainIndex = (domains: readonly VocabDomain[]): DomainIndex => new Map(domains.map((d) => [d.id, d]));

/** "Deep Learning › Machine Learning" (branch first, its field after). */
export function domainPath(domainId: string | null, domains: DomainIndex): string {
  const domain = domainId ? domains.get(domainId) : undefined;
  if (!domain) return "";
  const parent = domain.parent_id ? domains.get(domain.parent_id) : undefined;
  return parent ? `${domain.name} › ${parent.name}` : domain.name;
}

/** Confidence label (Tinggi/Sedang/Rendah) for a term's stored scores. */
export function confidenceLabel(term: Pick<VocabTerm, "domain_scores">, domains: DomainIndex): string {
  const level = confidenceFromStored(term.domain_scores, (id) => domains.get(id)?.parent_id);
  return CONFIDENCE_LABELS[level];
}

/** The top suggested domains for a pending term, best first, resolved to rows. */
export function suggestionsFor(term: Pick<VocabTerm, "domain_scores">, domains: DomainIndex, count = 3): VocabDomain[] {
  return [...(term.domain_scores ?? [])]
    .sort((a, b) => b.score - a.score)
    .map((s) => domains.get(s.domain_id))
    .filter((d): d is VocabDomain => Boolean(d))
    .slice(0, count);
}
