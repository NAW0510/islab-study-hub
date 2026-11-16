/**
 * Small seeded random number generator (mulberry32). UMAP is stochastic; with
 * a stored seed the same terms always produce the same map.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for the first layout (kept afterwards in the layout params). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
