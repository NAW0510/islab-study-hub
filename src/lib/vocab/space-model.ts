import { LAYOUT_3D_CONFIG } from "./layout/config";
import type { Point3 } from "./layout/run-layout-3d";

/**
 * The "Luar angkasa" view of the 3D brain map, as pure functions:
 *
 *   field (bidang)   → a galaxy with a black hole at its centre
 *   branch (cabang)  → a sun in that galaxy's disk
 *   term (istilah)   → a planet, a moon or a rock, depending on its role in meaning
 *
 * Everything here is deterministic: the same terms give the same sky.
 */

// ── Vectors ───────────────────────────────────────────────────────────────
type V3 = Point3;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: readonly number[], b: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Stable 32-bit hash of a string, mapped to [0, 1). */
export function hash01(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Roles ─────────────────────────────────────────────────────────────────

export type Role = { kind: "planet" } | { kind: "moon"; parent: string } | { kind: "rock" };

/** For each vector, the indices of the `k` most similar other vectors (unit vectors: dot = cosine). */
export function topNeighbours(vectors: readonly (readonly number[])[], k: number): number[][] {
  return vectors.map((v, i) =>
    vectors
      .map((w, j) => ({ j, s: i === j ? -Infinity : dot(v, w) }))
      .sort((a, b) => b.s - a.s || a.j - b.j)
      .slice(0, Math.min(k, vectors.length - 1))
      .map(({ j }) => j),
  );
}

/**
 * Planet, moon or rock for every term, decided per branch (`group`; null = no
 * domain, always a rock). Vectors must be unit length.
 *
 *   planet: the most central terms of the branch (highest mean similarity to the others)
 *   moon:   the rest, each orbiting its most similar planet
 *   rock:   the moons least tied to their planet, in branches big enough to have any
 */
export function assignRoles(
  terms: readonly { id: string; group: string | null }[],
  vectors: readonly (readonly number[])[],
  config: { planetShare: number; rockShare: number; rockMinGroup: number } = {
    planetShare: LAYOUT_3D_CONFIG.PLANET_SHARE,
    rockShare: LAYOUT_3D_CONFIG.ROCK_SHARE,
    rockMinGroup: LAYOUT_3D_CONFIG.ROCK_MIN_GROUP,
  },
): Map<string, Role> {
  const roles = new Map<string, Role>();
  const groups = new Map<string, number[]>();
  terms.forEach((t, i) => {
    if (t.group === null) roles.set(t.id, { kind: "rock" });
    else groups.set(t.group, [...(groups.get(t.group) ?? []), i]);
  });

  for (const members of groups.values()) {
    const n = members.length;
    const centrality = members.map((i) => {
      if (n === 1) return 1;
      let total = 0;
      for (const j of members) if (j !== i) total += dot(vectors[i], vectors[j]);
      return total / (n - 1);
    });
    const ranked = members.map((i, k) => ({ i, c: centrality[k] })).sort((a, b) => b.c - a.c || terms[a.i].id.localeCompare(terms[b.i].id));
    const planetCount = Math.max(1, Math.round(config.planetShare * n));
    const planets = ranked.slice(0, planetCount).map(({ i }) => i);
    for (const p of planets) roles.set(terms[p].id, { kind: "planet" });

    const others = ranked.slice(planetCount).map(({ i }) => {
      let parent = planets[0];
      let best = -Infinity;
      for (const p of planets) {
        const s = dot(vectors[i], vectors[p]);
        if (s > best) {
          best = s;
          parent = p;
        }
      }
      return { i, parent, best };
    });
    const rockCount = n >= config.rockMinGroup ? Math.floor(config.rockShare * n) : 0;
    const loosest = new Set([...others].sort((a, b) => a.best - b.best || terms[a.i].id.localeCompare(terms[b.i].id)).slice(0, rockCount).map((o) => o.i));
    for (const o of others) roles.set(terms[o.i].id, loosest.has(o.i) ? { kind: "rock" } : { kind: "moon", parent: terms[o.parent].id });
  }
  return roles;
}

// ── Layout ────────────────────────────────────────────────────────────────

export type BodyKind = "blackhole" | "cluster" | "sun" | "planet" | "moon" | "rock";

/** A circular orbit in the plane spanned by `u` and `w` (orthonormal), around the parent's position. */
export type Orbit = { radius: number; phase: number; speed: number; u: V3; w: V3; lift: V3 };

export type Body = {
  key: string;
  kind: BodyKind;
  /** Key of the body it orbits; null for a fixed body (black hole, rogue-rock cluster). */
  parent: string | null;
  /** Fixed position (black holes, clusters) or orbit around the parent. */
  at: V3 | null;
  orbit: Orbit | null;
  /** Visual radius, in scene units. */
  size: number;
  /** Field the body belongs to (colour); null for terms without a domain. */
  fieldId: string | null;
  /** Term id for planets, moons and rocks. */
  termId?: string;
  /** Branch key for suns. */
  branchKey?: string;
};

export type Galaxy = { fieldId: string | null; centre: V3; radius: number; normal: V3; u: V3; w: V3 };

export type SpaceLayout = { galaxies: Galaxy[]; bodies: Body[]; radius: number };

export type SpaceTerm = {
  id: string;
  /** Top-level field; null without a domain. */
  fieldId: string | null;
  /** Branch key (a branch id, or `${fieldId}:umum` for terms filed directly under a field); null without a domain. */
  branchKey: string | null;
  /** Position in the 3D (cube) layout, used to place galaxies where their fields are. */
  at: Point3;
};

function basisFor(normal: V3): { u: V3; w: V3 } {
  const helper: V3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(helper, normal));
  return { u, w: cross(normal, u) };
}

/** The galaxy disk normal: "up", tilted by an angle and direction taken from the field id. */
function tiltedNormal(key: string): V3 {
  const tilt = ((hash01(key, 1) * 2 - 1) * LAYOUT_3D_CONFIG.GALAXY_MAX_TILT * Math.PI) / 180;
  const turn = hash01(key, 2) * Math.PI * 2;
  return norm([Math.sin(tilt) * Math.cos(turn), Math.cos(tilt), Math.sin(tilt) * Math.sin(turn)]);
}

/** Pushes overlapping discs apart until each pair is at least `gap` × (sum of radii) apart. Deterministic. */
export function separate(centres: V3[], radii: number[], gap: number, rounds = 80): V3[] {
  const out = centres.map((c) => [...c] as V3);
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const want = gap * (radii[i] + radii[j]);
        let d = sub(out[j], out[i]);
        let l = len(d);
        if (l >= want) continue;
        if (l < 1e-6) {
          // Same spot: split along a fixed direction that depends on the pair.
          const a = (i * 2.399963 + j) % (Math.PI * 2);
          d = [Math.cos(a), 0.3, Math.sin(a)];
          l = 0;
        }
        const push = scale(norm(d), (want - l) / 2);
        out[i] = sub(out[i], push);
        out[j] = add(out[j], push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Places galaxies, suns and the orbits of every term. `roles` comes from
 * `assignRoles`. Sun and planet orbits share their galaxy's disk; moons and
 * rocks get a slight tilt of their own.
 */
export function spaceLayout(terms: readonly SpaceTerm[], roles: ReadonlyMap<string, Role>): SpaceLayout {
  const C = LAYOUT_3D_CONFIG;
  const byField = new Map<string | null, SpaceTerm[]>();
  for (const t of terms) byField.set(t.fieldId, [...(byField.get(t.fieldId) ?? []), t]);
  const fieldKeys = [...byField.keys()].sort((a, b) => (a ?? "~").localeCompare(b ?? "~"));

  // Galaxies (and one loose cluster for terms without a domain) where their fields sit in meaning-space.
  const radii = fieldKeys.map((f) => (f === null ? 0.45 : C.GALAXY_RADIUS_BASE + C.GALAXY_RADIUS_PER_SQRT * Math.sqrt((byField.get(f) ?? []).length)));
  const rawCentres = fieldKeys.map((f) => {
    const members = byField.get(f) ?? [];
    const mean: V3 = [0, 0, 0];
    for (const m of members) for (let a = 0; a < 3; a++) mean[a] += m.at[a] / members.length;
    return scale(mean, C.GALAXY_SPREAD);
  });
  const centres = separate(rawCentres, radii, C.GALAXY_GAP);
  const middle = scale(centres.reduce((s, c) => add(s, c), [0, 0, 0] as V3), 1 / Math.max(1, centres.length));

  const galaxies: Galaxy[] = [];
  const bodies: Body[] = [];
  const speed = (r: number, around: number) => C.ORBIT_SPEED * Math.pow(around / Math.max(r, 1e-3), 1.5);

  fieldKeys.forEach((fieldId, gi) => {
    const centre = sub(centres[gi], middle);
    const R = radii[gi];
    const key = fieldId ?? "none";
    const normal = tiltedNormal(key);
    const { u, w } = basisFor(normal);
    galaxies.push({ fieldId, centre, radius: R, normal, u, w });
    const members = byField.get(fieldId) ?? [];

    if (fieldId === null) {
      // Terms without a domain: a loose swarm of rocks, each on its own tilted orbit.
      bodies.push({ key: "cluster:none", kind: "cluster", parent: null, at: centre, orbit: null, size: 0, fieldId: null });
      for (const t of members) {
        const own = basisFor(tiltedNormal(`${t.id}:rock`));
        const r = R * (0.25 + 0.7 * hash01(t.id, 3));
        bodies.push({
          key: t.id,
          kind: "rock",
          parent: "cluster:none",
          at: null,
          orbit: { radius: r, phase: hash01(t.id, 4) * Math.PI * 2, speed: speed(r, R) * 0.5, u: own.u, w: own.w, lift: [0, 0, 0] },
          size: 0.022,
          fieldId: null,
          termId: t.id,
        });
      }
      return;
    }

    const holeKey = `hole:${fieldId}`;
    bodies.push({ key: holeKey, kind: "blackhole", parent: null, at: centre, orbit: null, size: R * C.BLACK_HOLE_SHARE, fieldId });

    // Suns: one per branch, spread over the disk area along a golden-angle spiral (largest branch nearest the centre).
    const branches = new Map<string, SpaceTerm[]>();
    for (const t of members) if (t.branchKey) branches.set(t.branchKey, [...(branches.get(t.branchKey) ?? []), t]);
    const branchKeys = [...branches.keys()].sort((a, b) => (branches.get(b)?.length ?? 0) - (branches.get(a)?.length ?? 0) || a.localeCompare(b));
    const m = branchKeys.length;
    const inner = R * 0.38;
    // Room around each sun for its planets: half the spacing between neighbouring suns, capped.
    const room = Math.min(R * 0.32, ((R - inner) / Math.max(1, Math.sqrt(m))) * 0.9);

    branchKeys.forEach((branchKey, si) => {
      const r = inner + (R - inner) * Math.sqrt((si + 0.5) / m);
      const sunKey = `sun:${branchKey}`;
      const own = branches.get(branchKey) ?? [];
      bodies.push({
        key: sunKey,
        kind: "sun",
        parent: holeKey,
        at: null,
        orbit: { radius: r, phase: si * 2.399963 + hash01(branchKey, 5) * 0.5, speed: speed(r, R) * 0.25, u, w, lift: [0, 0, 0] },
        size: 0.045 + 0.012 * Math.sqrt(own.length),
        fieldId,
        branchKey,
      });

      const planets = own.filter((t) => roles.get(t.id)?.kind === "planet").sort((a, b) => a.id.localeCompare(b.id));
      planets.forEach((p, pi) => {
        const pr = room * (0.3 + (0.55 * (pi + 0.5)) / Math.max(1, planets.length));
        // A little inclination per planet so the system does not look flat as a plate.
        const inc = (hash01(p.id, 6) * 2 - 1) * 0.15;
        const pw = norm(add(w, scale(normal, inc)));
        bodies.push({
          key: p.id,
          kind: "planet",
          parent: sunKey,
          at: null,
          orbit: { radius: pr, phase: hash01(p.id, 7) * Math.PI * 2, speed: speed(pr, room), u, w: pw, lift: [0, 0, 0] },
          size: 0.03,
          fieldId,
          termId: p.id,
        });
        const moons = own.filter((t) => {
          const role = roles.get(t.id);
          return role?.kind === "moon" && role.parent === p.id;
        });
        moons.sort((a, b) => a.id.localeCompare(b.id));
        moons.forEach((mo, mi) => {
          const mr = 0.09 + 0.03 * mi;
          const own2 = basisFor(norm(add(normal, scale(u, (hash01(mo.id, 8) * 2 - 1) * 0.6))));
          bodies.push({
            key: mo.id,
            kind: "moon",
            parent: p.id,
            at: null,
            orbit: { radius: mr, phase: hash01(mo.id, 9) * Math.PI * 2, speed: C.ORBIT_SPEED * 2.2 / (1 + mi * 0.4), u: own2.u, w: own2.w, lift: [0, 0, 0] },
            size: 0.018,
            fieldId,
            termId: mo.id,
          });
        });
      });

      // Rocks: an asteroid belt at the edge of this sun's system, with a little vertical scatter.
      own
        .filter((t) => roles.get(t.id)?.kind === "rock")
        .forEach((rock) => {
          const br = room * (0.92 + 0.12 * hash01(rock.id, 10));
          bodies.push({
            key: rock.id,
            kind: "rock",
            parent: sunKey,
            at: null,
            orbit: {
              radius: br,
              phase: hash01(rock.id, 11) * Math.PI * 2,
              speed: speed(br, room) * 0.6,
              u,
              w,
              lift: scale(normal, (hash01(rock.id, 12) * 2 - 1) * room * 0.08),
            },
            size: 0.02,
            fieldId,
            termId: rock.id,
          });
        });
    });
  });

  const radius = Math.max(1, ...galaxies.map((g) => len(g.centre) + g.radius * 1.1));
  return { galaxies, bodies, radius };
}

/** Offset of an orbiting body from its parent at time `t` (seconds). */
export function orbitOffset(orbit: Orbit, t: number): V3 {
  const a = orbit.phase + orbit.speed * t;
  return add(add(scale(orbit.u, orbit.radius * Math.cos(a)), scale(orbit.w, orbit.radius * Math.sin(a))), orbit.lift);
}

/** Positions of every body at time `t`. Parents come before their children in `bodies`. */
export function bodyPositions(layout: SpaceLayout, t: number): Map<string, V3> {
  const out = new Map<string, V3>();
  for (const body of layout.bodies) {
    if (body.at) out.set(body.key, body.at);
    else if (body.orbit && body.parent) out.set(body.key, add(out.get(body.parent) ?? [0, 0, 0], orbitOffset(body.orbit, t)));
  }
  return out;
}
