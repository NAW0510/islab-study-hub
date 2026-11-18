import { VOCAB_CONFIG, type VocabConfig } from "./vocab-config.ts";

/**
 * Domain classification: similarities in, decision out. Pure functions, so the
 * rule can be tested and calibrated without a database or a network.
 * The numbers live in vocab-config.ts.
 */

/** One row of `suggest_vocab_domains` for a single term. */
export type DomainSimilarity = {
  domainId: string;
  parentId: string | null;
  /** Cosine similarity with the domain prototype (name + description). */
  protoSim: number;
  /** Cosine similarity with the centroid of confirmed/manual terms; null when the domain has too few. */
  centroidSim: number | null;
};

export type ScoredDomain = { domainId: string; parentId: string | null; score: number };

/** Stored in `vocab_terms.domain_scores` (snake_case because it goes to the database as is). */
export type StoredScore = { domain_id: string; score: number };

export type Confidence = "tinggi" | "sedang" | "rendah";

export type Decision = {
  /** The chosen domain, or null when the system is not sure. */
  domainId: string | null;
  source: "auto" | "pending";
  confidence: Confidence;
  /** Best scores first, at most TOP_SCORES_KEPT. */
  top: StoredScore[];
};

type Thresholds = Pick<
  VocabConfig,
  | "PROTO_WEIGHT"
  | "AUTO_MIN_SCORE"
  | "AUTO_MIN_MARGIN"
  | "TOP_SCORES_KEPT"
  | "CONFIDENCE_HIGH_MARGIN"
  | "CONFIDENCE_MEDIUM_MARGIN"
>;

/**
 * Scores are rounded to four decimals before they are compared or stored, so
 * the decision made here and the label computed later from the stored scores
 * always agree, and 0.30 − 0.25 counts as 0.05 (not 0.04999…).
 */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Blend of prototype and centroid similarity; prototype only while there is no centroid. */
export function scoreDomain(sim: DomainSimilarity, config: Pick<VocabConfig, "PROTO_WEIGHT"> = VOCAB_CONFIG): number {
  if (sim.centroidSim === null || Number.isNaN(sim.centroidSim)) return sim.protoSim;
  return config.PROTO_WEIGHT * sim.protoSim + (1 - config.PROTO_WEIGHT) * sim.centroidSim;
}

/** Highest (rounded) score first; ties broken by id so the result never depends on input order. */
export function rankDomains(sims: readonly DomainSimilarity[], config: Pick<VocabConfig, "PROTO_WEIGHT"> = VOCAB_CONFIG) {
  return sims
    .map((sim): ScoredDomain => ({ domainId: sim.domainId, parentId: sim.parentId, score: round4(scoreDomain(sim, config)) }))
    .filter((d) => Number.isFinite(d.score))
    .sort((a, b) => b.score - a.score || a.domainId.localeCompare(b.domainId));
}

/** A field and one of its own branches (e.g. Machine Learning and Deep Learning). */
function isParentAndChild(a: { id: string; parentId: string | null }, b: { id: string; parentId: string | null }) {
  return a.parentId === b.id || b.parentId === a.id;
}

/**
 * Gap between the best score and its closest rival. A parent and its branch do
 * not compete with each other, so the rival is the best domain that is neither
 * the winner's parent nor one of its branches. Infinity when there is no rival.
 */
function marginOverRival(ranked: readonly { id: string; parentId: string | null; score: number }[]): number {
  const [best, ...rest] = ranked;
  if (!best) return 0;
  const rival = rest.find((d) => !isParentAndChild(best, d));
  return rival ? round4(best.score - rival.score) : Number.POSITIVE_INFINITY;
}

function confidenceFor(bestScore: number, margin: number, config: Thresholds): Confidence {
  if (bestScore < config.AUTO_MIN_SCORE) return "rendah";
  if (margin >= config.CONFIDENCE_HIGH_MARGIN) return "tinggi";
  if (margin >= config.CONFIDENCE_MEDIUM_MARGIN) return "sedang";
  return "rendah";
}

/**
 * The decision rule (spec §3.3):
 *   - best score ≥ AUTO_MIN_SCORE and margin over the rival ≥ AUTO_MIN_MARGIN → assign it ("auto")
 *   - otherwise → no domain ("pending"); the UI offers the top suggestions.
 */
export function decide(sims: readonly DomainSimilarity[], config: Thresholds = VOCAB_CONFIG): Decision {
  const ranked = rankDomains(sims, config);
  const top = ranked.slice(0, config.TOP_SCORES_KEPT).map((d) => ({ domain_id: d.domainId, score: d.score }));
  const best = ranked[0];
  if (!best) return { domainId: null, source: "pending", confidence: "rendah", top };

  const margin = marginOverRival(ranked.map((d) => ({ id: d.domainId, parentId: d.parentId, score: d.score })));
  const confidence = confidenceFor(best.score, margin, config);
  const sure = best.score >= config.AUTO_MIN_SCORE && margin >= config.AUTO_MIN_MARGIN;

  return sure
    ? { domainId: best.domainId, source: "auto", confidence, top }
    : { domainId: null, source: "pending", confidence, top };
}

/**
 * Confidence label for scores that were stored earlier (the UI only has the
 * top few). `parentOf` returns a domain's parent id, or null/undefined.
 * Never show the scores themselves as percentages.
 */
export function confidenceFromStored(
  scores: readonly StoredScore[] | null | undefined,
  parentOf: (domainId: string) => string | null | undefined,
  config: Thresholds = VOCAB_CONFIG,
): Confidence {
  const ranked = [...(scores ?? [])]
    .filter((s) => typeof s?.domain_id === "string" && Number.isFinite(s.score))
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ id: s.domain_id, parentId: parentOf(s.domain_id) ?? null, score: round4(s.score) }));
  const best = ranked[0];
  if (!best) return "rendah";
  return confidenceFor(best.score, marginOverRival(ranked), config);
}

/**
 * "Juga cocok di …": other domains a term seems to belong to as much as its
 * own (one term, many domains). From the stored scores, best first: a
 * domain qualifies when its score clears AUTO_MIN_SCORE and sits within
 * MULTI_SUGGEST_MARGIN of the best score, and it is neither a domain the
 * term already has nor the field or a branch of one (Agama adds nothing to
 * Islam). Only ever a suggestion; the user attaches extra domains.
 */
export function alsoFits(
  scores: readonly StoredScore[] | null | undefined,
  assigned: readonly string[],
  parentOf: (domainId: string) => string | null | undefined,
  config: Pick<VocabConfig, "AUTO_MIN_SCORE" | "MULTI_SUGGEST_MARGIN"> = VOCAB_CONFIG,
): string[] {
  const ranked = [...(scores ?? [])]
    .filter((s) => typeof s?.domain_id === "string" && Number.isFinite(s.score))
    .map((s) => ({ id: s.domain_id, score: round4(s.score) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = ranked[0];
  if (!best || assigned.length === 0) return [];

  const related = (a: string, b: string) => a === b || parentOf(a) === b || parentOf(b) === a;
  return ranked
    .filter((d) => d.score >= config.AUTO_MIN_SCORE && round4(best.score - d.score) <= config.MULTI_SUGGEST_MARGIN)
    .filter((d) => !assigned.some((a) => related(a, d.id)))
    .map((d) => d.id);
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  tinggi: "Tinggi",
  sedang: "Sedang",
  rendah: "Rendah",
};
