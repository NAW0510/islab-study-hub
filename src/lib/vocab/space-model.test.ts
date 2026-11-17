import { describe, expect, it } from "vitest";
import { mulberry32 } from "./layout/prng";
import { unitNormalize } from "./layout/normalize";
import type { Point3 } from "./layout/run-layout-3d";
import { assignRoles, bodyPositions, orbitOffset, separate, spaceLayout, topNeighbours, type SpaceTerm } from "./space-model";

/** Unit vectors in `groups` clusters; inside a cluster, the first vector is the most central. */
function clusters(sizes: number[], seed = 1) {
  const random = mulberry32(seed);
  const vectors: number[][] = [];
  const group: string[] = [];
  sizes.forEach((size, g) => {
    const centre = Array.from({ length: 32 }, () => random() * 2 - 1);
    for (let i = 0; i < size; i++) {
      const spread = i === 0 ? 0.05 : 0.3 + 0.1 * i;
      vectors.push(centre.map((c) => c + (random() * 2 - 1) * spread));
      group.push(`g${g}`);
    }
  });
  return { vectors: unitNormalize(vectors), group };
}

describe("topNeighbours", () => {
  it("lists the most similar other vectors, most similar first", () => {
    const v = unitNormalize([[1, 0], [0.9, 0.1], [0, 1], [0.2, 1]]);
    expect(topNeighbours(v, 2)).toEqual([[1, 3], [0, 3], [3, 1], [2, 1]]);
    expect(topNeighbours([[1, 0]], 2)).toEqual([[]]);
  });
});

describe("assignRoles", () => {
  it("gives every branch at least one planet, attaches moons to planets of the same branch, and makes no-domain terms rocks", () => {
    const { vectors, group } = clusters([1, 4, 12]);
    const terms = group.map((g, i) => ({ id: `t${i}`, group: g as string | null }));
    terms.push({ id: "loose", group: null });
    vectors.push(vectors[0]);
    const roles = assignRoles(terms, vectors);

    expect(roles.get("t0")).toEqual({ kind: "planet" }); // a branch of one
    for (const g of ["g0", "g1", "g2"]) {
      const ids = terms.filter((t) => t.group === g).map((t) => t.id);
      expect(ids.some((id) => roles.get(id)?.kind === "planet")).toBe(true);
      for (const id of ids) {
        const role = roles.get(id);
        if (role?.kind === "moon") expect(ids).toContain(role.parent);
      }
    }
    expect(roles.get("loose")).toEqual({ kind: "rock" });
  });

  it("makes the most central term a planet and keeps rocks to the share, only in big branches", () => {
    const { vectors, group } = clusters([4, 12]);
    const terms = group.map((g, i) => ({ id: `t${String(i).padStart(2, "0")}`, group: g }));
    const roles = assignRoles(terms, vectors);
    expect(roles.get("t00")?.kind).toBe("planet"); // the tight first member of g0
    const small = terms.filter((t) => t.group === "g0").map((t) => roles.get(t.id)?.kind);
    expect(small).not.toContain("rock"); // under ROCK_MIN_GROUP
    const big = terms.filter((t) => t.group === "g1").map((t) => roles.get(t.id)?.kind);
    expect(big.filter((k) => k === "planet")).toHaveLength(3); // 25% of 12
    expect(big.filter((k) => k === "rock").length).toBeLessThanOrEqual(Math.floor(0.2 * 12));
    expect(assignRoles(terms, vectors)).toEqual(roles); // deterministic
  });
});

describe("separate", () => {
  it("pushes overlapping galaxies apart, even from the same spot", () => {
    const out = separate([[0, 0, 0], [0, 0, 0], [0.5, 0, 0]], [1, 1, 0.5], 1.2);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const d = Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1], out[i][2] - out[j][2]);
        expect(d).toBeGreaterThanOrEqual(1.2 * ([1, 1, 0.5][i] + [1, 1, 0.5][j]) - 1e-6);
      }
  });
});

describe("spaceLayout", () => {
  const { vectors, group } = clusters([1, 4, 12], 3);
  const terms: SpaceTerm[] = group.map((g, i) => ({
    id: `t${i}`,
    fieldId: g === "g2" ? "fieldB" : "fieldA",
    branchKey: g,
    at: [g === "g2" ? 0.6 : -0.6, 0, 0] as Point3,
  }));
  terms.push({ id: "loose", fieldId: null, branchKey: null, at: [0, 0.8, 0] });
  vectors.push(vectors[0]);
  const roles = assignRoles(
    terms.map((t) => ({ id: t.id, group: t.branchKey })),
    vectors,
  );
  const layout = spaceLayout(terms, roles);

  it("has one black hole per field, one sun per branch, and a body for every term", () => {
    expect(layout.bodies.filter((b) => b.kind === "blackhole").map((b) => b.fieldId).sort()).toEqual(["fieldA", "fieldB"]);
    expect(layout.bodies.filter((b) => b.kind === "sun").map((b) => b.branchKey).sort()).toEqual(["g0", "g1", "g2"]);
    for (const t of terms) expect(layout.bodies.some((b) => b.termId === t.id)).toBe(true);
    expect(layout.bodies.find((b) => b.termId === "loose")).toMatchObject({ kind: "rock", parent: "cluster:none" });
  });

  it("orders parents before children, so positions can be computed in one pass", () => {
    const seen = new Set<string>();
    for (const b of layout.bodies) {
      if (b.parent) expect(seen.has(b.parent)).toBe(true);
      seen.add(b.key);
    }
  });

  it("keeps galaxies apart and moves bodies along periodic orbits", () => {
    const [a, b] = layout.galaxies.filter((g) => g.fieldId);
    expect(Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1], a.centre[2] - b.centre[2])).toBeGreaterThanOrEqual(1.25 * (a.radius + b.radius) - 1e-6);

    const planet = layout.bodies.find((x) => x.kind === "planet" && x.orbit) as NonNullable<(typeof layout.bodies)[number]>;
    const orbit = planet.orbit as NonNullable<typeof planet.orbit>;
    const period = (2 * Math.PI) / orbit.speed;
    const p0 = orbitOffset(orbit, 1.5);
    const p1 = orbitOffset(orbit, 1.5 + period);
    for (let k = 0; k < 3; k++) expect(p1[k]).toBeCloseTo(p0[k], 9);
    expect(Math.hypot(...orbitOffset(orbit, 0))).toBeCloseTo(orbit.radius, 9);

    const at0 = bodyPositions(layout, 0);
    const at5 = bodyPositions(layout, 5);
    expect(at0.size).toBe(layout.bodies.length);
    expect(at5.get(planet.key)).not.toEqual(at0.get(planet.key));
    // Black holes stay put.
    const hole = layout.bodies.find((x) => x.kind === "blackhole") as NonNullable<(typeof layout.bodies)[number]>;
    expect(at5.get(hole.key)).toEqual(at0.get(hole.key));
  });

  it("is deterministic", () => {
    expect(spaceLayout(terms, roles)).toEqual(layout);
  });
});
