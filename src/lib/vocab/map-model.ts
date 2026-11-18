import { weekNumberFor } from "../report-template";
import type { DomainSource, VocabDomain } from "../types";
import { LAYOUT_CONFIG } from "./layout/config";

/** Pure helpers behind the brain map: what is shown, how it is grouped, when to suggest a relayout. */

/** One row of the `vocab_map_points` RPC. */
export type MapPoint = {
  id: string;
  term: string;
  aliases: string[];
  domain_id: string | null;
  domain_source: DomainSource;
  learned_on: string;
  /** First 200 characters of the definition. */
  snippet: string;
  has_embedding: boolean;
  map_x: number | null;
  map_y: number | null;
  map_placed: "layout" | "knn" | null;
  /**
   * Extra domains (one term, many domains), oldest first. Optional so older
   * cached data and fixtures still type-check; read it with extrasOf().
   */
  extra_domain_ids?: string[] | null;
};

/** A map point's extra domains, never undefined. */
export const extrasOf = (p: Pick<MapPoint, "extra_domain_ids">): string[] => p.extra_domain_ids ?? [];

export type BoundaryLevel = "bidang" | "cabang" | "none";

/** Top-level field of a domain (itself when it has no parent); null without a domain. */
export function fieldOf(domainId: string | null, domains: ReadonlyMap<string, VocabDomain>): VocabDomain | null {
  const domain = domainId ? domains.get(domainId) : undefined;
  if (!domain) return null;
  return (domain.parent_id && domains.get(domain.parent_id)) || domain;
}

/** The group a point belongs to for region outlines at the given level. */
export function groupOf(point: Pick<MapPoint, "domain_id">, level: BoundaryLevel, domains: ReadonlyMap<string, VocabDomain>) {
  if (level === "none" || !point.domain_id) return null;
  return level === "bidang" ? fieldOf(point.domain_id, domains) : (domains.get(point.domain_id) ?? null);
}

/**
 * Every group a point belongs to at the given level: its primary domain's
 * first, then its extra domains' (one term, many domains), without repeats.
 */
export function groupsOf(
  point: Pick<MapPoint, "domain_id" | "extra_domain_ids">,
  level: BoundaryLevel,
  domains: ReadonlyMap<string, VocabDomain>,
): VocabDomain[] {
  const groups: VocabDomain[] = [];
  for (const id of [point.domain_id, ...extrasOf(point)]) {
    const group = groupOf({ domain_id: id }, level, domains);
    if (group && !groups.some((g) => g.id === group.id)) groups.push(group);
  }
  return groups;
}

/** The names of a point's extra domains ("Juga di: …"), as paths like "Katolik › Agama". */
export function extraDomainNames(point: Pick<MapPoint, "extra_domain_ids">, domains: ReadonlyMap<string, VocabDomain>): string[] {
  return extrasOf(point).flatMap((id) => {
    const d = domains.get(id);
    if (!d) return [];
    const parent = d.parent_id ? domains.get(d.parent_id) : undefined;
    return [parent ? `${d.name} › ${parent.name}` : d.name];
  });
}

/** Points with a position, learned up to the end of `week`, whose field is not hidden. */
export function visiblePoints<T extends MapPoint>(
  points: readonly T[],
  options: { programStart: string; week: number; hiddenFields: ReadonlySet<string>; domains: ReadonlyMap<string, VocabDomain> },
): T[] {
  return points.filter((p) => {
    if (p.map_x === null || p.map_y === null) return false;
    if (weekNumberFor(options.programStart, p.learned_on) > options.week) return false;
    const field = fieldOf(p.domain_id, options.domains);
    return !options.hiddenFields.has(field?.id ?? "none");
  });
}

export type LayoutAdvice =
  | { kind: "empty"; total: number }
  | { kind: "first"; ready: number }
  | { kind: "stale"; knn: number; unplaced: number }
  | { kind: "ok" };

/** Minimum number of terms before a map is worth drawing (spec §4.4). */
export const MIN_TERMS_FOR_MAP = 5;

/**
 * What the banner above the map should say:
 *   empty → too few terms; first → never laid out; stale → enough terms were
 *   added by kNN (or still lack a position) that a relayout is worth it.
 */
export function layoutAdvice(points: readonly MapPoint[]): LayoutAdvice {
  const embedded = points.filter((p) => p.has_embedding);
  if (points.length < MIN_TERMS_FOR_MAP) return { kind: "empty", total: points.length };

  const placed = embedded.filter((p) => p.map_x !== null);
  if (placed.length === 0) return { kind: "first", ready: embedded.length };

  const knn = placed.filter((p) => p.map_placed === "knn").length;
  const unplaced = embedded.length - placed.length;
  const threshold = Math.max(LAYOUT_CONFIG.RELAYOUT_MIN_KNN, LAYOUT_CONFIG.RELAYOUT_KNN_SHARE * embedded.length);
  return knn >= threshold || unplaced > 0 ? { kind: "stale", knn, unplaced } : { kind: "ok" };
}

export type MapStats = { total: number; activeDomains: number; thisWeek: number; biggestField: { name: string; count: number } | null };

export function mapStats(
  points: readonly MapPoint[],
  options: { programStart: string; currentWeek: number; domains: ReadonlyMap<string, VocabDomain> },
): MapStats {
  const perField = new Map<string, { name: string; count: number }>();
  const usedDomains = new Set<string>();
  let thisWeek = 0;
  for (const p of points) {
    if (p.domain_id) usedDomains.add(p.domain_id);
    if (weekNumberFor(options.programStart, p.learned_on) === options.currentWeek) thisWeek++;
    const field = fieldOf(p.domain_id, options.domains);
    if (field) {
      const entry = perField.get(field.id) ?? { name: field.name, count: 0 };
      entry.count++;
      perField.set(field.id, entry);
    }
  }
  const biggestField = [...perField.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;
  return { total: points.length, activeDomains: usedDomains.size, thisWeek, biggestField };
}

/** First sentence of a definition snippet, for the tooltip. */
export function firstSentence(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length > max ? `${sentence.slice(0, max).replace(/\s+\S*$/, "")}…` : sentence;
}
