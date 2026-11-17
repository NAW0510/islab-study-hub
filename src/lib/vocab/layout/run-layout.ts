import { UMAP } from "umap-js";
import { LAYOUT_CONFIG, type LayoutParams } from "./config";
import { boxFit, unitNormalize, type Point } from "./normalize";
import { pca2d } from "./pca";
import { mulberry32 } from "./prng";

/**
 * Embeddings → 2D coordinates in [-1, 1]². Runs inside the Web Worker (it
 * pulls in umap-js, which must never reach the page bundle) and in tests.
 *
 *   N < 3        a small circle
 *   3 ≤ N < 15   PCA (deterministic; UMAP is unstable for so few points)
 *   N ≥ 15       UMAP with a seeded random generator, plus two gentle forces
 *                explained in the config: a pull towards the centre, and on a
 *                relayout a pull of every term towards its place on the
 *                previous map.
 */
export type LayoutInput = {
  vectors: readonly (readonly number[])[];
  seed: number;
  /**
   * Optional supervision ("Rapikan per bidang"): one label per vector, the
   * index of its top-level field, or -1 when unknown. Null/undefined = off.
   */
  labels?: readonly number[] | null;
  /**
   * The current map, to start a relayout from: where each vector sits now (in
   * [-1, 1]²) or null without a position, whether that position came from a
   * layout (true) or is only a kNN estimate (false), and the parameters of the
   * layout that produced the map. Leave out for a layout from scratch.
   */
  previous?: PreviousLayout | null;
  onProgress?: (fraction: number) => void;
};

export type PreviousLayout = {
  positions: readonly (Point | null)[];
  fromLayout: readonly boolean[];
  params: LayoutParams | null;
};

export type LayoutResult = { coords: Point[]; params: LayoutParams };

export function runLayout({ vectors, seed, labels, previous, onProgress }: LayoutInput): LayoutResult {
  const n = vectors.length;
  const { PCA_MIN_POINTS, UMAP_MIN_POINTS, CIRCLE_RADIUS, UMAP_N_NEIGHBORS, UMAP_MIN_DIST, UMAP_SPREAD, UMAP_GRAVITY, RELAYOUT_ANCHOR } =
    LAYOUT_CONFIG;

  if (n < PCA_MIN_POINTS) {
    const coords: Point[] = Array.from({ length: n }, (_, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1) + Math.PI / 2;
      return n === 1 ? [0, 0] : [CIRCLE_RADIUS * Math.cos(angle), CIRCLE_RADIUS * Math.sin(angle)];
    });
    onProgress?.(1);
    return { coords, params: { method: "circle", seed, n } };
  }

  const data = unitNormalize(vectors);

  if (n < UMAP_MIN_POINTS) {
    onProgress?.(1);
    return { coords: boxFit(pca2d(data)).points, params: { method: "pca", seed, n } };
  }

  const nNeighbors = Math.min(UMAP_N_NEIGHBORS, n - 1);
  const supervised = Boolean(labels && labels.length === n && labels.some((l) => l >= 0));
  const warm = warmStart(data, previous, supervised, seed);

  const raw = umapLayout(data, {
    seed,
    labels: supervised ? labels : null,
    start: warm?.start ?? coldStart(data, seed),
    anchors: warm?.anchors,
    onProgress,
    tuning: { nNeighbors, minDist: UMAP_MIN_DIST, spread: UMAP_SPREAD, gravity: UMAP_GRAVITY, anchor: RELAYOUT_ANCHOR },
  });
  const { points, scale } = boxFit(raw);

  return {
    coords: points,
    params: {
      method: "umap",
      seed,
      n,
      nNeighbors,
      minDist: UMAP_MIN_DIST,
      spread: UMAP_SPREAD,
      supervised,
      init: warm ? "previous" : "pca",
      unitsPerBox: Number((1 / scale).toFixed(4)),
    },
  };
}

/**
 * Layout from scratch: start from the PCA projection, scaled to a box that
 * grows with √N. Deterministic, and it keeps the large-scale arrangement of
 * the terms, which umap-js's own random scatter throws away.
 */
function coldStart(data: number[][], seed: number): Point[] {
  const flat = pca2d(data);
  const reach = Math.max(1e-9, ...flat.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  const half = Math.min(LAYOUT_CONFIG.UMAP_INIT_MAX_EXTENT, LAYOUT_CONFIG.UMAP_INIT_EXTENT_PER_SQRT_N * Math.sqrt(data.length));
  // A whisker of seeded noise, so identical vectors do not start on exactly the same spot.
  const noise = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  return flat.map(([x, y]) => [(x / reach) * half + (noise() - 0.5) * 0.01, (y / reach) * half + (noise() - 0.5) * 0.01]);
}

/**
 * Relayout: every term starts where it is on the current map, scaled back to
 * UMAP's own units, and terms that a layout placed are anchored there. A term
 * without a position starts between its most similar positioned terms.
 * Returns null when the old map should not be reused: it was not made by UMAP
 * with the same kind of supervision, or too few of its terms are left.
 */
function warmStart(
  data: number[][],
  previous: PreviousLayout | null | undefined,
  supervised: boolean,
  seed: number,
): { start: Point[]; anchors: (Point | null)[] } | null {
  const params = previous?.params;
  if (!previous || !params || params.method !== "umap" || Boolean(params.supervised) !== supervised) return null;
  const unitsPerBox = params.unitsPerBox;
  const { positions, fromLayout } = previous;
  if (!unitsPerBox || !(unitsPerBox > 0) || positions.length !== data.length) return null;

  const toUnits = (p: Point): Point => [p[0] * unitsPerBox, p[1] * unitsPerBox];
  const anchors = positions.map((p, i) => (p && fromLayout[i] ? toUnits(p) : null));
  if (anchors.filter(Boolean).length < LAYOUT_CONFIG.WARM_START_MIN_SHARE * data.length) return null;

  const known: number[] = [];
  positions.forEach((p, i) => p && known.push(i));
  const noise = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  const start = positions.map((p, i): Point => {
    if (p) return toUnits(p);
    // Weighted mean of the K most similar positioned terms (the rule the Edge Function uses for new terms).
    const nearest = known
      .map((k) => {
        let dot = 0;
        for (let d = 0; d < data[i].length; d++) dot += data[i][d] * data[k][d];
        return { k, weight: Math.max(dot, 0) ** 2 };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, LAYOUT_CONFIG.WARM_START_K);
    const total = nearest.reduce((sum, item) => sum + item.weight, 0);
    let x = 0;
    let y = 0;
    for (const { k, weight } of nearest) {
      const share = total > 0 ? weight / total : 1 / nearest.length;
      const [px, py] = toUnits(positions[k] as Point);
      x += px * share;
      y += py * share;
    }
    return [x + (noise() - 0.5) * 0.1, y + (noise() - 0.5) * 0.1];
  });
  return { start, anchors };
}

export type UmapTuning = {
  nNeighbors: number;
  minDist: number;
  spread: number;
  /** Pull of every point towards the centre per epoch, as a fraction of its distance (0 = plain UMAP). */
  gravity: number;
  /** Pull of an anchored point towards its anchor per epoch, as a fraction of its distance. */
  anchor: number;
};

/**
 * The UMAP step on its own: unit-length input in, raw UMAP coordinates out.
 * `runLayout` calls it with the numbers from LAYOUT_CONFIG; it is exported so
 * tests can compare tunings on the same data.
 */
export function umapLayout(
  data: number[][],
  options: {
    seed: number;
    labels?: readonly number[] | null;
    /** Starting positions in UMAP units; omit for umap-js's own random scatter over ±10. */
    start?: readonly Point[] | null;
    /** Where each point should stay close to (UMAP units), or null for a point that is free to move. */
    anchors?: readonly (Point | null)[] | null;
    onProgress?: (fraction: number) => void;
    tuning: UmapTuning;
  },
): Point[] {
  const { seed, labels, start, anchors, onProgress, tuning } = options;
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: tuning.nNeighbors,
    minDist: tuning.minDist,
    spread: tuning.spread,
    random: mulberry32(seed),
  });
  if (labels) umap.setSupervisedProjection([...labels]);

  const epochs = umap.initializeFit(data);
  // umap-js hands out its own rows, and its optimiser keeps references to them: writing into
  // them is how the start is replaced and how the two extra forces below are applied.
  const rows = umap.getEmbedding();
  start?.forEach(([x, y], i) => {
    rows[i][0] = x;
    rows[i][1] = y;
  });

  const reportEvery = Math.max(1, Math.floor(epochs / 50));
  for (let epoch = 0; epoch < epochs; epoch++) {
    umap.step();
    // Both forces cool down on UMAP's own schedule, so their balance with UMAP's forces holds to the end.
    const cooling = 1 - epoch / epochs;

    if (tuning.gravity > 0) {
      let cx = 0;
      let cy = 0;
      for (const row of rows) {
        cx += row[0] / rows.length;
        cy += row[1] / rows.length;
      }
      const pull = tuning.gravity * cooling;
      for (const row of rows) {
        row[0] -= (row[0] - cx) * pull;
        row[1] -= (row[1] - cy) * pull;
      }
    }
    if (anchors && tuning.anchor > 0) {
      const hold = tuning.anchor * cooling;
      anchors.forEach((anchor, i) => {
        if (!anchor) return;
        rows[i][0] -= (rows[i][0] - anchor[0]) * hold;
        rows[i][1] -= (rows[i][1] - anchor[1]) * hold;
      });
    }
    if (onProgress && epoch % reportEvery === 0) onProgress(epoch / epochs);
  }
  onProgress?.(1);
  return rows.map(([x, y]) => [x, y] as Point);
}
