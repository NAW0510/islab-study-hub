import { UMAP } from "umap-js";
import { LAYOUT_3D_CONFIG, LAYOUT_CONFIG } from "./config";
import { unitNormalize } from "./normalize";
import { mulberry32 } from "./prng";

/**
 * Embeddings → 3D coordinates in [-1, 1]³ for the 3D brain map. Same recipe
 * as the 2D map (run-layout.ts), one dimension up:
 *
 *   N < 3        a small fixed shape
 *   3 ≤ N < 15   PCA, three components (deterministic)
 *   N ≥ 15       UMAP with a fixed seed, started from PCA, with a weak pull
 *                towards the centre; when an earlier 3D layout is given, it
 *                starts from there and keeps every known term near its place.
 *
 * Runs inside the 3D Web Worker (umap-js stays out of the page bundle) and in
 * tests. Separate from run-layout.ts so the 2D map is not affected.
 */
export type Point3 = [number, number, number];

export type Layout3dMethod = "small" | "pca" | "umap";

export type Previous3d = {
  /** Position in the earlier layout (in [-1, 1]³), or null for a term it did not have. */
  positions: readonly (Point3 | null)[];
  /** UMAP units per box unit of that layout (`unitsPerBox` of its result). */
  unitsPerBox: number | null;
};

export type Layout3dResult = {
  coords: Point3[];
  method: Layout3dMethod;
  /** How the UMAP run started; null for the small and PCA layouts. */
  init: "pca" | "previous" | null;
  /** UMAP units per box unit, for the next run to start from this one. */
  unitsPerBox: number | null;
};

export function runLayout3d({
  vectors,
  seed = LAYOUT_3D_CONFIG.SEED,
  previous,
  onProgress,
}: {
  vectors: readonly (readonly number[])[];
  seed?: number;
  previous?: Previous3d | null;
  onProgress?: (fraction: number) => void;
}): Layout3dResult {
  const n = vectors.length;
  const { PCA_MIN_POINTS, UMAP_MIN_POINTS, CIRCLE_RADIUS } = LAYOUT_CONFIG;

  if (n < PCA_MIN_POINTS) {
    const r = CIRCLE_RADIUS;
    const shapes: Point3[][] = [[], [[0, 0, 0]], [[-r, 0, 0], [r, 0, 0]]];
    onProgress?.(1);
    return { coords: shapes[n], method: "small", init: null, unitsPerBox: null };
  }

  const data = unitNormalize(vectors);

  if (n < UMAP_MIN_POINTS) {
    onProgress?.(1);
    return { coords: boxFit3(pca3d(data)).points, method: "pca", init: null, unitsPerBox: null };
  }

  const warm = warmStart3d(data, previous, seed);
  const raw = umapLayout3d(data, {
    seed,
    start: warm?.start ?? coldStart3d(data, seed),
    anchors: warm?.anchors,
    onProgress,
    tuning: {
      nNeighbors: Math.min(LAYOUT_CONFIG.UMAP_N_NEIGHBORS, n - 1),
      minDist: LAYOUT_CONFIG.UMAP_MIN_DIST,
      spread: LAYOUT_CONFIG.UMAP_SPREAD,
      gravity: LAYOUT_3D_CONFIG.GRAVITY,
      anchor: LAYOUT_3D_CONFIG.ANCHOR,
    },
  });
  const { points, scale } = boxFit3(raw);
  return { coords: points, method: "umap", init: warm ? "previous" : "pca", unitsPerBox: Number((1 / scale).toFixed(4)) };
}

/**
 * Three principal components of a handful of high-dimensional vectors, via
 * the N×N Gram matrix and power iteration with deflation (the method of
 * pca.ts, for three axes). A missing axis (fewer than four points) is 0.
 */
export function pca3d(vectors: readonly (readonly number[])[]): Point3[] {
  const n = vectors.length;
  if (n === 0) return [];
  const dims = vectors[0].length;

  const mean = new Array<number>(dims).fill(0);
  for (const vector of vectors) for (let d = 0; d < dims; d++) mean[d] += vector[d] / n;
  const centred = vectors.map((vector) => vector.map((v, d) => v - mean[d]));

  const gram: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += centred[i][d] * centred[j][d];
      gram[i][j] = dot;
      gram[j][i] = dot;
    }
  }

  const axes: { vector: number[]; value: number }[] = [];
  for (let k = 0; k < 3; k++) {
    // Fixed, non-constant start: the constant vector is in the null space of a centred Gram matrix.
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + k * 0.9 + 1));
    let value = 0;
    for (let iteration = 0; iteration < 300; iteration++) {
      for (const axis of axes) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += v[i] * axis.vector[i];
        for (let i = 0; i < n; i++) v[i] -= dot * axis.vector[i];
      }
      const next = gram.map((row) => row.reduce((sum, g, j) => sum + g * v[j], 0));
      const norm = Math.hypot(...next);
      if (norm < 1e-12) {
        value = 0;
        break;
      }
      const unit = next.map((x) => x / norm);
      const change = unit.reduce((sum, x, i) => sum + Math.abs(x - v[i]), 0);
      v = unit;
      value = norm;
      if (change < 1e-10) break;
    }
    // Fix the sign so the same input always gives the same picture.
    const lead = v.reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0);
    if (lead < 0) v = v.map((x) => -x);
    axes.push({ vector: v, value });
  }

  const along = (k: number, i: number) => (axes[k].value > 0 ? axes[k].vector[i] * Math.sqrt(axes[k].value) : 0);
  return Array.from({ length: n }, (_, i) => [along(0, i), along(1, i), along(2, i)]);
}

/** Centres the points and scales them uniformly so the longest side spans [-1, 1] (minus a margin). */
export function boxFit3(points: readonly Point3[], margin = 0.05): { points: Point3[]; scale: number } {
  if (points.length === 0) return { points: [], scale: 1 };
  const min: Point3 = [Infinity, Infinity, Infinity];
  const max: Point3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let a = 0; a < 3; a++) {
      if (p[a] < min[a]) min[a] = p[a];
      if (p[a] > max[a]) max[a] = p[a];
    }
  }
  const centre = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
  const half = Math.max(...[0, 1, 2].map((a) => (max[a] - min[a]) / 2));
  const scale = half > 0 ? (1 - margin) / half : 1;
  return { points: points.map((p) => [0, 1, 2].map((a) => (p[a] - centre[a]) * scale) as Point3), scale };
}

/** First 3D layout: PCA scaled to a cube that grows with ∛N, plus a whisker of seeded noise. */
function coldStart3d(data: number[][], seed: number): Point3[] {
  const flat = pca3d(data);
  const reach = Math.max(1e-9, ...flat.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))));
  const half = Math.min(LAYOUT_CONFIG.UMAP_INIT_MAX_EXTENT, LAYOUT_3D_CONFIG.INIT_EXTENT_PER_CBRT_N * Math.cbrt(data.length));
  const noise = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  return flat.map((p) => p.map((x) => (x / reach) * half + (noise() - 0.5) * 0.01) as Point3);
}

/**
 * Start from the earlier 3D layout: known terms where they were (and anchored
 * there), new terms between their most similar known terms. Null when there
 * is no usable earlier layout or too few of its terms are left.
 */
function warmStart3d(
  data: number[][],
  previous: Previous3d | null | undefined,
  seed: number,
): { start: Point3[]; anchors: (Point3 | null)[] } | null {
  const unitsPerBox = previous?.unitsPerBox;
  if (!previous || !unitsPerBox || !(unitsPerBox > 0) || previous.positions.length !== data.length) return null;

  const known: number[] = [];
  previous.positions.forEach((p, i) => p && known.push(i));
  if (known.length < LAYOUT_CONFIG.WARM_START_MIN_SHARE * data.length) return null;

  const toUnits = (p: Point3) => p.map((x) => x * unitsPerBox) as Point3;
  const anchors = previous.positions.map((p) => (p ? toUnits(p) : null));
  const noise = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  const start = previous.positions.map((p, i): Point3 => {
    if (p) return toUnits(p);
    const nearest = known
      .map((k) => {
        let dot = 0;
        for (let d = 0; d < data[i].length; d++) dot += data[i][d] * data[k][d];
        return { k, weight: Math.max(dot, 0) ** 2 };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, LAYOUT_CONFIG.WARM_START_K);
    const total = nearest.reduce((sum, item) => sum + item.weight, 0);
    const at: Point3 = [0, 0, 0];
    for (const { k, weight } of nearest) {
      const share = total > 0 ? weight / total : 1 / nearest.length;
      const q = anchors[k] as Point3;
      for (let a = 0; a < 3; a++) at[a] += q[a] * share;
    }
    return at.map((x) => x + (noise() - 0.5) * 0.1) as Point3;
  });
  return { start, anchors };
}

export type Umap3dTuning = { nNeighbors: number; minDist: number; spread: number; gravity: number; anchor: number };

/** The UMAP step in three dimensions; exported for tests. */
export function umapLayout3d(
  data: number[][],
  options: {
    seed: number;
    start?: readonly Point3[] | null;
    anchors?: readonly (Point3 | null)[] | null;
    onProgress?: (fraction: number) => void;
    tuning: Umap3dTuning;
  },
): Point3[] {
  const { seed, start, anchors, onProgress, tuning } = options;
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: tuning.nNeighbors,
    minDist: tuning.minDist,
    spread: tuning.spread,
    random: mulberry32(seed),
  });
  const epochs = umap.initializeFit(data);
  // umap-js's optimiser keeps references to these rows: writing into them replaces the start
  // and applies the two extra forces (see LAYOUT_3D_CONFIG).
  const rows = umap.getEmbedding();
  start?.forEach((p, i) => {
    for (let a = 0; a < 3; a++) rows[i][a] = p[a];
  });

  const reportEvery = Math.max(1, Math.floor(epochs / 50));
  for (let epoch = 0; epoch < epochs; epoch++) {
    umap.step();
    const cooling = 1 - epoch / epochs;
    if (tuning.gravity > 0) {
      const centre = [0, 0, 0];
      for (const row of rows) for (let a = 0; a < 3; a++) centre[a] += row[a] / rows.length;
      const pull = tuning.gravity * cooling;
      for (const row of rows) for (let a = 0; a < 3; a++) row[a] -= (row[a] - centre[a]) * pull;
    }
    if (anchors && tuning.anchor > 0) {
      const hold = tuning.anchor * cooling;
      anchors.forEach((anchor, i) => {
        if (!anchor) return;
        for (let a = 0; a < 3; a++) rows[i][a] -= (rows[i][a] - anchor[a]) * hold;
      });
    }
    if (onProgress && epoch % reportEvery === 0) onProgress(epoch / epochs);
  }
  onProgress?.(1);
  return rows.map((row) => [row[0], row[1], row[2]] as Point3);
}
