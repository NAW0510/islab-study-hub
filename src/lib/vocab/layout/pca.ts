import type { Point } from "./normalize";

/**
 * 2D PCA for a handful of high-dimensional vectors (N < dimensions), used
 * while there are too few terms for UMAP. Deterministic: no randomness.
 *
 * With N rows of 512 numbers it is cheaper to work on the N×N Gram matrix
 * (dot products between centred rows) than on the 512×512 covariance: both
 * give the same projection. The two leading eigenvectors are found by power
 * iteration with deflation.
 */
export function pca2d(vectors: readonly (readonly number[])[]): Point[] {
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
  for (let k = 0; k < 2; k++) {
    // Fixed, non-constant start: the constant vector is in the null space of a centred Gram matrix.
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + k * 0.9 + 1));
    let value = 0;
    for (let iteration = 0; iteration < 300; iteration++) {
      // Remove what earlier axes already explain, then multiply by the matrix.
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

  // Coordinates along an axis = eigenvector × sqrt(eigenvalue).
  return Array.from({ length: n }, (_, i) => [
    axes[0].vector[i] * Math.sqrt(Math.max(axes[0].value, 0)),
    axes[1].vector[i] * Math.sqrt(Math.max(axes[1].value, 0)),
  ]);
}
