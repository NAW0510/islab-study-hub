export type Point = [number, number];

/**
 * Scales every vector to length 1. Euclidean distance between unit vectors
 * orders pairs exactly like cosine similarity does, so UMAP's default metric
 * then follows the same notion of "close" as the classifier.
 */
export function unitNormalize(vectors: readonly (readonly number[])[]): number[][] {
  return vectors.map((vector) => {
    let sum = 0;
    for (const v of vector) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    return vector.map((v) => v / norm);
  });
}

/**
 * Centres the points and scales them uniformly so the longer side spans
 * [-1, 1]. The aspect ratio is kept: distances mean the same in x and y.
 * `margin` leaves a little room at the edges.
 */
export function fitToBox(points: readonly Point[], margin = 0.05): Point[] {
  return boxFit(points, margin).points;
}

/** `fitToBox` that also reports the factor it multiplied by (1 when there was nothing to scale). */
export function boxFit(points: readonly Point[], margin = 0.05): { points: Point[]; scale: number } {
  if (points.length === 0) return { points: [], scale: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  const scale = half > 0 ? (1 - margin) / half : 1;
  return { points: points.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]), scale };
}
