import { ATLAS_CONFIG } from "./config";

/**
 * The Bahasa atlas's countries (countries.json, from scripts/build-atlas.mjs):
 * decoding, projection, and which country lies under a point. Pure and
 * DOM-free; the hologram and the SVG map both use it.
 */

/** countries.json as written by the build script. */
export type RawAtlas = {
  v: number;
  scale: number;
  countries: { c: string; n: string; l: number[]; f: number[]; p: number[][][] }[];
};

export type AtlasCountry = {
  code: string;
  name: string;
  /** Label point, [lon, lat]. */
  label: [number, number];
  /** The main land to frame, [west, south, east, north]. */
  focus: [number, number, number, number];
  /** Bounding box of every polygon, [west, south, east, north]. */
  bbox: [number, number, number, number];
  /** Polygons; each is rings (outer first, then holes) of flat [lon, lat, lon, lat, …]. */
  polygons: number[][][];
};

export type AtlasData = { countries: AtlasCountry[]; byCode: Map<string, AtlasCountry> };

export function decodeAtlas(raw: RawAtlas): AtlasData {
  const countries = raw.countries.map((c): AtlasCountry => {
    const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    const polygons = c.p.map((rings) =>
      rings.map((enc) => {
        const ring: number[] = new Array(enc.length);
        let x = 0;
        let y = 0;
        for (let i = 0; i < enc.length; i += 2) {
          x += enc[i];
          y += enc[i + 1];
          const lon = x / raw.scale;
          const lat = y / raw.scale;
          ring[i] = lon;
          ring[i + 1] = lat;
          if (lon < bbox[0]) bbox[0] = lon;
          if (lat < bbox[1]) bbox[1] = lat;
          if (lon > bbox[2]) bbox[2] = lon;
          if (lat > bbox[3]) bbox[3] = lat;
        }
        return ring;
      }),
    );
    return {
      code: c.c,
      name: c.n,
      label: [c.l[0], c.l[1]],
      focus: [c.f[0], c.f[1], c.f[2], c.f[3]],
      bbox,
      polygons,
    };
  });
  return { countries, byCode: new Map(countries.map((c) => [c.code, c])) };
}

const { WIDTH, LAT_TOP, LAT_BOTTOM } = ATLAS_CONFIG.map;
/** World units per degree (the same both ways: an equirectangular map). */
export const UNITS_PER_DEGREE = WIDTH / 360;
export const MAP_HEIGHT = (LAT_TOP - LAT_BOTTOM) * UNITS_PER_DEGREE;
const LAT_MID = (LAT_TOP + LAT_BOTTOM) / 2;

/** [lon, lat] → the map's local [x, y], centred on the map. */
export function project(lon: number, lat: number): [number, number] {
  return [lon * UNITS_PER_DEGREE, (lat - LAT_MID) * UNITS_PER_DEGREE];
}

/** The map's local [x, y] → [lon, lat]. */
export function unproject(x: number, y: number): [number, number] {
  return [x / UNITS_PER_DEGREE, y / UNITS_PER_DEGREE + LAT_MID];
}

/** Even-odd test against one flat ring. */
export function inRing(lon: number, lat: number, ring: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country at a point, or null for the sea. Holes count (Lesotho inside South Africa). */
export function countryAt(data: AtlasData, lon: number, lat: number): AtlasCountry | null {
  for (const country of data.countries) {
    const [w, s, e, n] = country.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    for (const [outer, ...holes] of country.polygons) {
      if (inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))) return country;
    }
  }
  return null;
}

/** What the camera frames for a country: its main land, at least `minSpan` degrees across. */
export function focusFrame(country: AtlasCountry, minSpan: number = ATLAS_CONFIG.camera.FOCUS_MIN_SPAN) {
  const [w, s, e, n] = country.focus;
  const lon = (w + e) / 2;
  const lat = (s + n) / 2;
  return { lon, lat, width: Math.max(e - w, minSpan), height: Math.max(n - s, minSpan * 0.6) };
}
