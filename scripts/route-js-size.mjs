// Prints the first-load JS and CSS (gzip) of each app route from the last
// `npm run build`. Used to check the performance budget in
// docs/SPEC_KOSAKATA_PETA_OTAK.md §8.4 without needing a logged-in browser.
//
//   npm run build && node scripts/route-js-size.mjs [--json]

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const root = join(import.meta.dirname, "..", ".next");
const appDir = join(root, "server", "app");
if (!existsSync(appDir)) {
  console.error("Belum ada hasil build. Jalankan `npm run build` dulu.");
  process.exit(1);
}

const sizeCache = new Map();
function gzipSize(file) {
  if (!sizeCache.has(file)) {
    const path = join(root, file);
    sizeCache.set(file, existsSync(path) ? gzipSync(readFileSync(path)).length : 0);
  }
  return sizeCache.get(file);
}
const total = (files) => [...files].reduce((sum, f) => sum + gzipSize(f), 0);

const shared = new Set(JSON.parse(readFileSync(join(root, "build-manifest.json"), "utf8")).rootMainFiles);

function* manifests(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* manifests(path);
    else if (name === "page_client-reference-manifest.js") yield path;
  }
}

/** "(app)/notes/[id]/page_client-…" → "/notes/[id]" (route groups dropped). */
function routeOf(manifestPath) {
  const parts = relative(appDir, manifestPath).split(sep).slice(0, -1);
  return "/" + parts.filter((p) => !/^\(.*\)$/.test(p)).join("/");
}

const rows = [];
for (const path of manifests(appDir)) {
  const sandbox = { globalThis: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox);
  const manifest = Object.values(sandbox.globalThis.__RSC_MANIFEST ?? {})[0];
  if (!manifest) continue;

  const js = new Set(shared);
  for (const files of Object.values(manifest.entryJSFiles ?? {})) for (const f of files) js.add(f);
  const css = new Set();
  for (const files of Object.values(manifest.entryCSSFiles ?? {})) for (const f of files) css.add(f.path ?? f);

  rows.push({ route: routeOf(path), js: total(js), css: total(css) });
}
rows.sort((a, b) => a.route.localeCompare(b.route));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ shared: total(shared), routes: rows }, null, 2));
} else {
  const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " kB";
  console.log(`Shared by all routes: ${kb(total(shared))}\n`);
  console.log("Route".padEnd(28) + "First-load JS".padStart(14) + "CSS".padStart(12));
  for (const r of rows) console.log(r.route.padEnd(28) + kb(r.js).padStart(14) + kb(r.css).padStart(12));
}
