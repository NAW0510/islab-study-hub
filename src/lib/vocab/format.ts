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

/**
 * The line the weekly report autofill adds to "What did you learn or
 * discover?" (spec §9): "- Istilah baru minggu ini (2): tensor, overfitting".
 * Empty when no term was learned in the period.
 */
export function newTermsLine(terms: readonly string[]): string {
  const names = terms.map((t) => t.trim()).filter(Boolean);
  return names.length === 0 ? "" : `- Istilah baru minggu ini (${names.length}): ${names.join(", ")}`;
}

/** A term's extra domains (one term, many domains), oldest first; empty when none or not loaded. */
export function extraDomainIds(term: Pick<VocabTerm, "extra_domains">): string[] {
  return [...(term.extra_domains ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.domain_id.localeCompare(b.domain_id))
    .map((x) => x.domain_id);
}

/** Every domain of a term: the primary one first, then the extras. */
export function termDomainIds(term: Pick<VocabTerm, "domain_id" | "extra_domains">): string[] {
  return [...(term.domain_id ? [term.domain_id] : []), ...extraDomainIds(term).filter((id) => id !== term.domain_id)];
}

/**
 * Does a term belong to `domainId`, or to one of its branches? (Filters,
 * Perpustakaan rooms and counts look at every domain of a term.)
 */
export function inDomain(term: Pick<VocabTerm, "domain_id" | "extra_domains">, domainId: string, domains: DomainIndex): boolean {
  return termDomainIds(term).some((id) => id === domainId || domains.get(id)?.parent_id === domainId);
}

/** The top suggested domains for a pending term, best first, resolved to rows. */
export function suggestionsFor(term: Pick<VocabTerm, "domain_scores">, domains: DomainIndex, count = 3): VocabDomain[] {
  return [...(term.domain_scores ?? [])]
    .sort((a, b) => b.score - a.score)
    .map((s) => domains.get(s.domain_id))
    .filter((d): d is VocabDomain => Boolean(d))
    .slice(0, count);
}
