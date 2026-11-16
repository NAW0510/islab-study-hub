import { UMAP } from "umap-js";
import { LAYOUT_CONFIG, type LayoutParams } from "./config";
import { fitToBox, unitNormalize, type Point } from "./normalize";
import { pca2d } from "./pca";
import { mulberry32 } from "./prng";

/**
 * Embeddings → 2D coordinates in [-1, 1]². Runs inside the Web Worker (it
 * pulls in umap-js, which must never reach the page bundle) and in tests.
 *
 *   N < 3        a small circle
 *   3 ≤ N < 15   PCA (deterministic; UMAP is unstable for so few points)
 *   N ≥ 15       UMAP with a seeded random generator
 */
export type LayoutInput = {
  vectors: readonly (readonly number[])[];
  seed: number;
  /**
   * Optional supervision ("Rapikan per bidang"): one label per vector, the
   * index of its top-level field, or -1 when unknown. Null/undefined = off.
   */
  labels?: readonly number[] | null;
  onProgress?: (fraction: number) => void;
};

export type LayoutResult = { coords: Point[]; params: LayoutParams };

export function runLayout({ vectors, seed, labels, onProgress }: LayoutInput): LayoutResult {
  const n = vectors.length;
  const { PCA_MIN_POINTS, UMAP_MIN_POINTS, CIRCLE_RADIUS, UMAP_N_NEIGHBORS, UMAP_MIN_DIST, UMAP_SPREAD } = LAYOUT_CONFIG;

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
    const coords = fitToBox(pca2d(data));
    onProgress?.(1);
    return { coords, params: { method: "pca", seed, n } };
  }

  const nNeighbors = Math.min(UMAP_N_NEIGHBORS, n - 1);
  const supervised = Boolean(labels && labels.length === n && labels.some((l) => l >= 0));
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist: UMAP_MIN_DIST,
    spread: UMAP_SPREAD,
    random: mulberry32(seed),
  });
  if (supervised) umap.setSupervisedProjection([...(labels as readonly number[])]);

  const epochs = umap.initializeFit(data);
  const reportEvery = Math.max(1, Math.floor(epochs / 50));
  for (let epoch = 0; epoch < epochs; epoch++) {
    umap.step();
    if (onProgress && epoch % reportEvery === 0) onProgress(epoch / epochs);
  }
  onProgress?.(1);

  return {
    coords: fitToBox(umap.getEmbedding() as Point[]),
    params: { method: "umap", seed, n, nNeighbors, minDist: UMAP_MIN_DIST, spread: UMAP_SPREAD, supervised },
  };
}
