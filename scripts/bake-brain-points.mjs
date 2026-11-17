// Bakes the neuron positions of the 3D brain view ("Otak") from a brain mesh
// in GLB format, and measures how many points the brain's outline needs.
//
//   node scripts/bake-brain-points.mjs "path/to/brain human.glb"          # report only
//   node scripts/bake-brain-points.mjs "path/to/brain human.glb" --write  # also writes src/lib/vocab/brain-points.ts
//
// Source model: "Brain" by dgallichan (https://sketchfab.com/dgallichan),
// https://sketchfab.com/3d-models/brain-cadd2bde67404c43b2359a6a3281d84a,
// licensed CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). The mesh
// itself is not part of this repository; only points sampled from its surface.
//
// Steps:
//   1. read every triangle (positions are RAS millimetres: x right, y front, z up);
//   2. map to the app's axes (x front, y up, z right), centre, scale to length 2;
//   3. sample the surface uniformly by area;
//   4. keep only the OUTER surface: an MRI cortex hides about two thirds of its
//      area in the sulci, and neurons down there blur the outline. Sulci are
//      closed by dilating the surface voxels, the outside is flood-filled, and
//      only points near that closed envelope are kept;
//   5. order those points by farthest point sampling: any prefix of the order
//      is itself evenly spread, so the app takes the first N it needs;
//   6. report, for N points, the spacing between neighbours and how much of the
//      brain's silhouette edge (side, top, front) they cover.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Pakai: node scripts/bake-brain-points.mjs "path/to/model.glb" [--write]');
  process.exit(1);
}
const BAKED = 5000;

// ── GLB ────────────────────────────────────────────────────────────────────
const glb = readFileSync(file);
if (glb.toString("ascii", 0, 4) !== "glTF" || glb.readUInt32LE(4) !== 2) throw new Error("Bukan berkas GLB versi 2.");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength));

function accessor(index) {
  const a = gltf.accessors[index];
  const view = gltf.bufferViews[a.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const stride = view.byteStride ?? components * bytes;
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const read = { 5121: (o) => bin.readUInt8(o), 5123: (o) => bin.readUInt16LE(o), 5125: (o) => bin.readUInt32LE(o), 5126: (o) => bin.readFloatLE(o) }[a.componentType];
  const out = new Float64Array(a.count * components);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) out[i * components + c] = read(base + i * stride + c * bytes);
  return out;
}

const triangles = []; // flat [ax, ay, az, bx, ...] in RAS millimetres
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4) continue;
    const position = accessor(primitive.attributes.POSITION);
    const indices = primitive.indices !== undefined ? accessor(primitive.indices) : Float64Array.from({ length: position.length / 3 }, (_, i) => i);
    for (let i = 0; i + 2 < indices.length; i += 3) for (let k = 0; k < 3; k++) triangles.push(...position.subarray(indices[i + k] * 3, indices[i + k] * 3 + 3));
  }
}
const triangleCount = triangles.length / 9;

// RAS (x right, y anterior, z superior) → app axes (x front, y up, z right), then centre and scale to length 2.
const toApp = (x, y, z) => [y, z, x];
const raw = new Float64Array(triangles.length);
for (let i = 0; i < triangles.length; i += 3) raw.set(toApp(triangles[i], triangles[i + 1], triangles[i + 2]), i);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < raw.length; i += 3) for (let a = 0; a < 3; a++) {
  min[a] = Math.min(min[a], raw[i + a]);
  max[a] = Math.max(max[a], raw[i + a]);
}
const centre = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
const mmPerUnit = (max[0] - min[0]) / 2;
for (let i = 0; i < raw.length; i += 3) for (let a = 0; a < 3; a++) raw[i + a] = (raw[i + a] - centre[a]) / mmPerUnit;

// ── Uniform samples on the surface ────────────────────────────────────────
let seed = 20261117;
const random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const areas = new Float64Array(triangleCount);
let total = 0;
for (let t = 0; t < triangleCount; t++) {
  const o = t * 9;
  const ab = [raw[o + 3] - raw[o], raw[o + 4] - raw[o + 1], raw[o + 5] - raw[o + 2]];
  const ac = [raw[o + 6] - raw[o], raw[o + 7] - raw[o + 1], raw[o + 8] - raw[o + 2]];
  const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  total += Math.hypot(...cross) / 2;
  areas[t] = total;
}
function sampleSurface(count) {
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = random() * total;
    let lo = 0;
    let hi = triangleCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const o = lo * 9;
    for (let a = 0; a < 3; a++) out[i * 3 + a] = raw[o + a] + u * (raw[o + 3 + a] - raw[o + a]) + v * (raw[o + 6 + a] - raw[o + a]);
  }
  return out;
}
const dense = sampleSurface(400000);

// ── Keep the outer surface ────────────────────────────────────────────────
const R = 120;
const lo3 = [-1.06, -1.06, -1.06];
const cell = 2.12 / R;
const voxel = (x, y, z) => {
  const i = Math.floor((x - lo3[0]) / cell);
  const j = Math.floor((y - lo3[1]) / cell);
  const k = Math.floor((z - lo3[2]) / cell);
  return i < 0 || j < 0 || k < 0 || i >= R || j >= R || k >= R ? -1 : i + R * (j + R * k);
};
const surface = new Uint8Array(R * R * R);
for (let i = 0; i < dense.length; i += 3) {
  const v = voxel(dense[i], dense[i + 1], dense[i + 2]);
  if (v >= 0) surface[v] = 1;
}
// Close the sulci: every surface voxel grows by DILATE voxels (≈ 3.5 mm).
const DILATE = 2;
const solid = new Uint8Array(R * R * R);
for (let k = 0; k < R; k++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
  if (!surface[i + R * (j + R * k)]) continue;
  for (let dk = -DILATE; dk <= DILATE; dk++) for (let dj = -DILATE; dj <= DILATE; dj++) for (let di = -DILATE; di <= DILATE; di++) {
    const a = i + di;
    const b = j + dj;
    const c = k + dk;
    if (a >= 0 && b >= 0 && c >= 0 && a < R && b < R && c < R && di * di + dj * dj + dk * dk <= DILATE * DILATE) solid[a + R * (b + R * c)] = 1;
  }
}
// Distance (in voxels) from the outside, by breadth-first search from the border of the grid.
const depth = new Int16Array(R * R * R).fill(-1);
let queue = [];
for (let k = 0; k < R; k++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
  if (i && j && k && i < R - 1 && j < R - 1 && k < R - 1) continue;
  const v = i + R * (j + R * k);
  if (!solid[v]) {
    depth[v] = 0;
    queue.push(v);
  }
}
const steps = [1, -1, R, -R, R * R, -R * R];
while (queue.length) {
  const next = [];
  for (const v of queue) {
    for (const s of steps) {
      const w = v + s;
      if (w < 0 || w >= depth.length || depth[w] !== -1) continue;
      depth[w] = solid[w] ? depth[v] + 1 : 0;
      if (solid[w] && depth[w] > DILATE + 3) continue;
      next.push(w);
    }
  }
  queue = next;
}
const OUTER = DILATE + 2;
const outer = [];
for (let i = 0; i < dense.length; i += 3) {
  const d = depth[voxel(dense[i], dense[i + 1], dense[i + 2])];
  if (d >= 0 && d <= OUTER) outer.push([dense[i], dense[i + 1], dense[i + 2]]);
}

// ── Farthest point sampling order ─────────────────────────────────────────
const pool = [];
const keep = Math.min(1, 30000 / outer.length);
for (const p of outer) if (random() < keep) pool.push(p);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const order = [];
const spacing = []; // distance of each new point to the ones before: the minimum spacing of that prefix
const nearest = new Float64Array(pool.length).fill(Infinity);
let pick = 0;
for (let n = 0; n < Math.min(BAKED, pool.length); n++) {
  const p = pool[pick];
  order.push(p);
  spacing.push(n === 0 ? Infinity : nearest[pick]);
  nearest[pick] = -1;
  let best = -1;
  for (let i = 0; i < pool.length; i++) {
    if (nearest[i] < 0) continue;
    const d = dist(pool[i], p);
    if (d < nearest[i]) nearest[i] = d;
    if (best < 0 || nearest[i] > nearest[best]) best = i;
  }
  pick = best;
}

// ── Outline coverage ──────────────────────────────────────────────────────
const G = 160;
const lo = -1.15;
const span = 2.3;
const views = { samping: [0, 1], atas: [0, 2], depan: [2, 1] };
function raster(points, view, radius) {
  const grid = new Uint8Array(G * G);
  const c = span / G;
  const rc = Math.ceil(radius / c);
  for (const p of points) {
    const gi = Math.floor((p[view[0]] - lo) / c);
    const gj = Math.floor((p[view[1]] - lo) / c);
    for (let di = -rc; di <= rc; di++) for (let dj = -rc; dj <= rc; dj++) {
      const i = gi + di;
      const j = gj + dj;
      if (i < 0 || j < 0 || i >= G || j >= G) continue;
      if (Math.hypot(lo + (i + 0.5) * c - p[view[0]], lo + (j + 0.5) * c - p[view[1]]) <= radius) grid[j * G + i] = 1;
    }
  }
  return grid;
}
const densePoints = [];
for (let i = 0; i < dense.length; i += 3 * 4) densePoints.push([dense[i], dense[i + 1], dense[i + 2]]);
const boundary = Object.fromEntries(
  Object.entries(views).map(([name, view]) => {
    const g = raster(densePoints, view, 0.02);
    const b = [];
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const v = j * G + i;
      if (g[v] && (!g[v - 1] || !g[v + 1] || !g[v - G] || !g[v + G])) b.push([lo + (i + 0.5) * (span / G), lo + (j + 0.5) * (span / G)]);
    }
    return [name, b];
  }),
);
function outline(points, tolerance) {
  const shares = Object.entries(views).map(([name, view]) => {
    let hit = 0;
    for (const [u, w] of boundary[name]) if (points.some((p) => Math.hypot(p[view[0]] - u, p[view[1]] - w) <= tolerance)) hit++;
    return hit / boundary[name].length;
  });
  return shares.reduce((s, x) => s + x, 0) / shares.length;
}

// Visible dot sizes in the brain view: a lit term ≈ 0.04 radius, a sleeping neuron ≈ 0.015.
// The eye bridges a gap of about one dot between neighbours.
const TERM_TOLERANCE = 0.04 + 0.04;
const NEURON_TOLERANCE = 0.015 + 0.03;

console.log(`Model: ${gltf.asset?.extras?.title ?? "?"} oleh ${gltf.asset?.extras?.author ?? "?"} (${gltf.asset?.extras?.license ?? "lisensi tidak tercantum"})`);
console.log(`Segitiga: ${triangleCount.toLocaleString("id-ID")}; panjang otak ${(mmPerUnit * 2).toFixed(0)} mm (1 satuan = ${mmPerUnit.toFixed(1)} mm)`);
console.log(`Ukuran (satuan app): x ${(-(max[0] - min[0]) / 2 / mmPerUnit).toFixed(2)}…${((max[0] - min[0]) / 2 / mmPerUnit).toFixed(2)}, y ±${((max[1] - min[1]) / 2 / mmPerUnit).toFixed(2)}, z ±${((max[2] - min[2]) / 2 / mmPerUnit).toFixed(2)}`);
console.log(`Sampel permukaan: ${dense.length / 3}; di permukaan luar: ${outer.length} (${((outer.length / (dense.length / 3)) * 100).toFixed(0)}%)`);
console.log("");
console.log("     N  jarak min (mm)  garis tepi: istilah  neuron tidur");
for (const n of [100, 150, 200, 250, 300, 325, 350, 375, 400, 600, 800, 1000, 1200, 1500, 1750, 2000, 2500, 3000]) {
  if (n > order.length) break;
  const prefix = order.slice(0, n);
  const s = spacing[n - 1];
  console.log(
    `${String(n).padStart(6)}  ${(s * mmPerUnit).toFixed(1).padStart(8)} (${s.toFixed(3)})  ${(outline(prefix, TERM_TOLERANCE) * 100).toFixed(0).padStart(10)}%  ${(outline(prefix, NEURON_TOLERANCE) * 100).toFixed(0).padStart(10)}%`,
  );
}

// ASCII preview of the outer points (side view, front to the right).
if (flags.includes("--preview")) {
  for (const [name, view] of Object.entries(views)) {
    const W = 80;
    const H = 34;
    const g = raster(order.slice(0, 1500), view, 0.03);
    const rows = [];
    for (let j = H - 1; j >= 0; j--) {
      let row = "";
      for (let i = 0; i < W; i++) {
        const gi = Math.floor(((i + 0.5) / W) * G);
        const gj = Math.floor(((j + 0.5) / H) * G);
        row += g[gj * G + gi] ? "#" : " ";
      }
      rows.push(row.replace(/\s+$/, ""));
    }
    console.log(`\n--- ${name} (1500 titik) ---\n${rows.filter((r) => r.trim()).join("\n")}`);
  }
}

if (flags.includes("--write")) {
  const q = new Int16Array(order.length * 3);
  order.forEach((p, i) => p.forEach((x, a) => (q[i * 3 + a] = Math.round(x * 16384))));
  const base64 = Buffer.from(q.buffer).toString("base64");
  const target = fileURLToPath(new URL("../src/lib/vocab/brain-points.ts", import.meta.url));
  writeFileSync(
    target,
    `// Generated by scripts/bake-brain-points.mjs. Do not edit by hand.
//
// Neuron positions for the 3D brain view, sampled from the outer surface of
// "Brain" by dgallichan (https://sketchfab.com/dgallichan),
// https://sketchfab.com/3d-models/brain-cadd2bde67404c43b2359a6a3281d84a,
// licensed CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
// Changes: the mesh is reduced to evenly spaced points on its outer surface
// and rescaled to the app's axes; the mesh itself is not included.

/** ${order.length} points in farthest-point order (any prefix is evenly spread), x/y/z as Int16 / 16384. */
const DATA = "${base64}";

/** Millimetres per app unit in the source model (the brain is 2 units long). */
export const BRAIN_MM_PER_UNIT = ${mmPerUnit.toFixed(3)};

let cache: [number, number, number][] | null = null;

/** The baked points, decoded once. x = front (+), y = up, z = right (+); the brain is about 2 units long. */
export function brainPoints(): [number, number, number][] {
  if (cache) return cache;
  const bytes = Uint8Array.from(atob(DATA), (c) => c.charCodeAt(0));
  const values = new Int16Array(bytes.buffer);
  cache = Array.from({ length: values.length / 3 }, (_, i) => [values[i * 3] / 16384, values[i * 3 + 1] / 16384, values[i * 3 + 2] / 16384]);
  return cache;
}
`,
  );
  console.log(`\nDitulis: src/lib/vocab/brain-points.ts (${order.length} titik, ${(base64.length / 1024).toFixed(0)} kB base64)`);
}
