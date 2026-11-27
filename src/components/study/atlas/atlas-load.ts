import { decodeAtlas, type AtlasData, type RawAtlas } from "@/lib/study/atlas/geo";

/**
 * The Bahasa atlas's two late loads: the country shapes (countries.json,
 * ~80 KB gzipped) and the hologram (three.js and its scene). Neither weighs
 * on any route's first load; heading for the Bahasa book (pointer over,
 * focus, press) or idling on the books shelf starts both, so the book can
 * lift off its sheet the moment it is opened. Failures reset, so a later
 * visit tries again.
 */
let data: Promise<AtlasData> | null = null;
let engine: Promise<typeof import("./hologram")> | null = null;
let mesh: Promise<{ data: AtlasData; mesh: import("./atlas-mesh").AtlasMesh }> | null = null;

export function loadAtlasData(): Promise<AtlasData> {
  data ??= import("@/lib/study/atlas/countries.json")
    .then((m) => decodeAtlas((m.default ?? m) as unknown as RawAtlas))
    .catch((error) => {
      data = null;
      throw error;
    });
  return data;
}

export function loadHologram(): Promise<typeof import("./hologram")> {
  engine ??= import("./hologram").catch((error) => {
    engine = null;
    throw error;
  });
  return engine;
}

/** The shapes with the hologram's triangulated geometry (atlas-mesh.ts), built once. */
export function loadAtlasMesh() {
  mesh ??= Promise.all([loadAtlasData(), import("./atlas-mesh")])
    .then(([d, m]) => ({ data: d, mesh: m.buildAtlasMesh(d) }))
    .catch((error) => {
      mesh = null;
      throw error;
    });
  return mesh;
}

/** Warm everything, unless the visitor asked to save data; the hologram is skipped under reduced motion. */
export function preloadAtlas() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  void loadAtlasData().catch(() => undefined);
  void import("./language-atlas").catch(() => undefined);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void loadHologram().catch(() => undefined);
  void loadAtlasMesh().catch(() => undefined);
}
