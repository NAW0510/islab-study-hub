#!/usr/bin/env node
/**
 * Builds the Bahasa atlas's country data from Natural Earth (public domain).
 *
 *   node scripts/build-atlas.mjs path/to/ne_50m_admin_0_countries.geojson
 *
 * Source: https://github.com/nvkelso/natural-earth-vector (geojson/
 * ne_50m_admin_0_countries.geojson), downloaded once by hand; it is not
 * kept in the repo. Writes:
 *
 *   src/lib/study/atlas/countries.json   shapes, label points, focus boxes
 *   src/lib/study/atlas/country-names.ts  alpha-2 → Indonesian name (NAME_ID)
 *
 * Shapes are simplified (Douglas–Peucker), quantised to 0.01° and stored as
 * deltas per ring: [x0, y0, dx1, dy1, …] in hundredths of a degree. Somaliland
 * joins Somalia and Northern Cyprus joins Cyprus; Antarctica and the Siachen
 * Glacier are left out. The focus box frames a country's main land (France
 * without French Guiana, the US without Alaska) for the atlas's camera.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOLERANCE = 0.045; // degrees
const MIN_RING_AREA = 0.004; // square degrees; smaller islets go, unless they are all a country has
const SCALE = 100; // stored units per degree
const FOCUS_SHARE = 0.08; // a polygon joins the focus box at ≥ 8% of the largest one's area…
const FOCUS_REACH = 30; // …and with its centre within 30° of the largest one's

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-atlas.mjs <ne_50m_admin_0_countries.geojson>");
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/lib/study/atlas");

const geo = JSON.parse(readFileSync(input, "utf8"));
const JOIN = { Somaliland: "SO", "N. Cyprus": "CY", "Northern Cyprus": "CY" };
const SKIP = new Set(["AQ"]);
const SKIP_NAMES = new Set(["Siachen Glacier", "Antarctica"]);

function codeOf(p) {
  if (JOIN[p.NAME] || JOIN[p.ADMIN]) return JOIN[p.NAME] ?? JOIN[p.ADMIN];
  for (const key of ["ISO_A2_EH", "ISO_A2"]) if (/^[A-Z]{2}$/.test(p[key] ?? "")) return p[key];
  return null;
}

// ---------------------------------------------------------------- geometry
const area = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
};
const centre = (ring) => {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return [x / ring.length, y / ring.length];
};
function simplify(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let best = -1;
    let bestD = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d;
      if (len === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
/** Quantised, closing point dropped, consecutive duplicates removed, delta-encoded. */
function encode(ring) {
  const q = [];
  for (const [x, y] of ring) {
    const qx = Math.round(x * SCALE);
    const qy = Math.round(y * SCALE);
    const last = q[q.length - 1];
    if (!last || last[0] !== qx || last[1] !== qy) q.push([qx, qy]);
  }
  if (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop();
  if (q.length < 3) return null;
  const out = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) out.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  return out;
}

// ---------------------------------------------------------------- countries
const byCode = new Map();
for (const feature of geo.features) {
  const p = feature.properties;
  const code = codeOf(p);
  if (!code || SKIP.has(code) || SKIP_NAMES.has(p.NAME) || SKIP_NAMES.has(p.ADMIN)) continue;
  const g = feature.geometry;
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const joined = Boolean(JOIN[p.NAME] ?? JOIN[p.ADMIN]);
  let entry = byCode.get(code);
  if (!entry) {
    entry = { code, name: null, label: null, polygons: [] };
    byCode.set(code, entry);
  }
  if (!joined || !entry.name) {
    entry.name = String(p.NAME_ID || p.NAME || code).trim();
    entry.label = [Number(p.LABEL_X), Number(p.LABEL_Y)];
  }
  entry.polygons.push(...polygons);
}

let points = 0;
const countries = [];
for (const entry of [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))) {
  // Focus box: the largest polygon and its sizeable neighbours.
  const measured = entry.polygons.map((poly) => {
    const [cx, cy] = centre(poly[0]);
    return { poly, area: area(poly[0]) * Math.cos((cy * Math.PI) / 180), cx, cy };
  });
  const largest = measured.reduce((a, b) => (b.area > a.area ? b : a));
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const m of measured) {
    const near = Math.hypot(m.cx - largest.cx, m.cy - largest.cy) <= FOCUS_REACH;
    if (m !== largest && (m.area < largest.area * FOCUS_SHARE || !near)) continue;
    for (const [x, y] of m.poly[0]) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }

  const polys = [];
  for (const m of [...measured].sort((a, b) => b.area - a.area)) {
    const tiny = area(m.poly[0]) < MIN_RING_AREA;
    if (tiny && polys.length > 0) continue;
    const rings = [];
    for (const [i, ring] of m.poly.entries()) {
      if (i > 0 && area(ring) < MIN_RING_AREA) continue; // small holes go
      const enc = encode(simplify(ring, tiny ? TOLERANCE / 8 : TOLERANCE));
      if (enc) rings.push(enc);
      else if (i === 0) break;
    }
    if (rings.length) {
      polys.push(rings);
      points += rings.reduce((n, r) => n + r.length / 2, 0);
    }
  }
  if (!polys.length) continue;
  const round = (v) => Math.round(v * 100) / 100;
  countries.push({ c: entry.code, n: entry.name, l: entry.label.map(round), f: box.map(round), p: polys });
}

mkdirSync(outDir, { recursive: true });
const json = JSON.stringify({ v: 1, scale: SCALE, source: "Natural Earth 1:50m Admin 0 Countries (public domain)", countries });
writeFileSync(resolve(outDir, "countries.json"), json + "\n");

const names = [...countries].sort((a, b) => a.n.localeCompare(b.n, "id"));
const ts = `// Generated by scripts/build-atlas.mjs from Natural Earth (public domain). Do not edit by hand.

/** ISO 3166-1 alpha-2 → Indonesian name, for every country on the Bahasa atlas (sorted by name). */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
${names.map((c) => `  ${c.c}: ${JSON.stringify(c.n)},`).join("\n")}
};
`;
writeFileSync(resolve(outDir, "country-names.ts"), ts);

console.log(`${countries.length} countries, ${points} points, countries.json ${(json.length / 1024).toFixed(0)} KB`);
