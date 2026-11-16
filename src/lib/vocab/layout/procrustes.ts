import type { Point } from "./normalize";

/**
 * Orthogonal Procrustes in 2D: the rotation (optionally with a mirror flip),
 * uniform scale and shift that best map one set of points onto another.
 *
 * A fresh UMAP run can come out rotated or mirrored compared with the previous
 * one, which makes a familiar map look foreign. Aligning the new layout to the
 * old one with the terms they share keeps regions where the user remembers them.
 */
export type Similarity = {
  /** 2×2 matrix [[a, b], [c, d]], already including the scale. */
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
  /** True when the best fit needed a mirror flip. */
  reflected: boolean;
};

export const IDENTITY: Similarity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, reflected: false };

export function applySimilarity(points: readonly Point[], t: Similarity): Point[] {
  return points.map(([x, y]) => [t.a * x + t.b * y + t.tx, t.c * x + t.d * y + t.ty]);
}

/**
 * Best similarity transform taking `source[i]` to `target[i]`.
 * Needs at least two pairs; with fewer (or degenerate input) it returns the identity.
 */
export function fitSimilarity(source: readonly Point[], target: readonly Point[]): Similarity {
  const n = Math.min(source.length, target.length);
  if (n < 2) return IDENTITY;

  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (let i = 0; i < n; i++) {
    sx += source[i][0] / n;
    sy += source[i][1] / n;
    tx += target[i][0] / n;
    ty += target[i][1] / n;
  }

  // For centred points: dot = Σ x·y, cross = Σ x×y give the best rotation angle
  // directly. The mirrored candidate flips the source's y first.
  let dot = 0;
  let cross = 0;
  let dotM = 0;
  let crossM = 0;
  let sourceSize = 0;
  for (let i = 0; i < n; i++) {
    const x = source[i][0] - sx;
    const y = source[i][1] - sy;
    const u = target[i][0] - tx;
    const v = target[i][1] - ty;
    dot += x * u + y * v;
    cross += x * v - y * u;
    dotM += x * u - y * v;
    crossM += x * v + y * u;
    sourceSize += x * x + y * y;
  }
  if (sourceSize < 1e-12) return IDENTITY;

  // The larger of the two "explained" amounts wins; it equals scale × sourceSize.
  const plain = Math.hypot(dot, cross);
  const mirrored = Math.hypot(dotM, crossM);
  const reflected = mirrored > plain + 1e-12;
  const strength = reflected ? mirrored : plain;
  if (strength < 1e-12) return IDENTITY;

  const scale = strength / sourceSize;
  const cos = (reflected ? dotM : dot) / strength;
  const sin = (reflected ? crossM : cross) / strength;

  // Rotation [[cos, −sin], [sin, cos]], applied after the optional flip of y.
  const a = scale * cos;
  const b = scale * (reflected ? sin : -sin);
  const c = scale * sin;
  const d = scale * (reflected ? -cos : cos);

  return { a, b, c, d, tx: tx - (a * sx + b * sy), ty: ty - (c * sx + d * sy), reflected };
}

/**
 * Aligns a new layout to the previous one using the ids both contain.
 * With fewer than three shared ids there is nothing reliable to align to and
 * the new layout is returned unchanged.
 */
export function alignLayout(
  next: ReadonlyMap<string, Point>,
  previous: ReadonlyMap<string, Point>,
): { coords: Map<string, Point>; shared: number; transform: Similarity } {
  const source: Point[] = [];
  const target: Point[] = [];
  for (const [id, point] of next) {
    const old = previous.get(id);
    if (old) {
      source.push(point);
      target.push(old);
    }
  }
  if (source.length < 3) return { coords: new Map(next), shared: source.length, transform: IDENTITY };

  const transform = fitSimilarity(source, target);
  const ids = [...next.keys()];
  const moved = applySimilarity([...next.values()], transform);
  return { coords: new Map(ids.map((id, i) => [id, moved[i]])), shared: source.length, transform };
}
