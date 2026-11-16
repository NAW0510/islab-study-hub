import { VOCAB_CONFIG, type VocabConfig } from "./vocab-config.ts";

/**
 * Places a new term on the brain map without recomputing the whole layout
 * (spec §4.2): the weighted average of its nearest neighbours that already
 * have a position. Pure function; the numbers live in vocab-config.ts.
 */
export type PlacedNeighbor = {
  /** Cosine similarity between the new term and this neighbour. */
  similarity: number;
  x: number;
  y: number;
};

export type Position = { x: number; y: number };

/** FNV-1a: a small, stable hash so the jitter of an id never changes. */
function hash(text: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Position for term `id`, or null when it has no placed neighbours yet (the
 * map was never laid out): the term then waits for the first "Susun peta".
 *
 *   weight = max(similarity, 0)²   — close neighbours count far more
 *   position = Σ weight·pos / Σ weight, plus a tiny fixed jitter
 */
export function placeByNeighbors(
  id: string,
  neighbors: readonly PlacedNeighbor[],
  config: Pick<VocabConfig, "KNN_PLACEMENT_K" | "KNN_JITTER_RADIUS"> = VOCAB_CONFIG,
): Position | null {
  const nearest = [...neighbors]
    .filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.similarity))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, config.KNN_PLACEMENT_K);
  if (nearest.length === 0) return null;

  let total = 0;
  let x = 0;
  let y = 0;
  for (const n of nearest) {
    const weight = Math.max(n.similarity, 0) ** 2;
    total += weight;
    x += weight * n.x;
    y += weight * n.y;
  }
  if (total > 0) {
    x /= total;
    y /= total;
  } else {
    // Nothing is similar at all: fall back to the plain centre of the neighbours.
    x = nearest.reduce((sum, n) => sum + n.x, 0) / nearest.length;
    y = nearest.reduce((sum, n) => sum + n.y, 0) / nearest.length;
  }

  // Uniform inside a small disc: sqrt keeps the points from bunching at the centre.
  const angle = 2 * Math.PI * hash(id, 1);
  const radius = config.KNN_JITTER_RADIUS * Math.sqrt(hash(id, 2));
  return { x: clamp(x + radius * Math.cos(angle)), y: clamp(y + radius * Math.sin(angle)) };
}
