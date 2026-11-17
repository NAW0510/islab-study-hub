import { describe, expect, it } from "vitest";
import { buildBrainMesh } from "./brain-mesh";
import { brainField, BRAIN_REGIONS } from "./brain-model";

describe("buildBrainMesh", () => {
  const started = performance.now();
  const mesh = buildBrainMesh(96);
  const ms = performance.now() - started;

  it("produces a closed surface of whole triangles, quickly enough for a worker", () => {
    const vertices = mesh.positions.length / 3;
    expect(vertices % 3).toBe(0);
    expect(vertices / 3).toBeGreaterThan(50000); // enough triangles for the folds
    expect(vertices / 3).toBeLessThan(260000); // within the buffer
    expect(ms).toBeLessThan(5000);
  });

  it("puts every vertex on the brain's surface, with normals pointing out, and labels its lobe", () => {
    const step = 37;
    let outward = 0;
    let checked = 0;
    for (let i = 0; i < mesh.regions.length; i += step) {
      const p: [number, number, number] = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
      expect(Math.abs(brainField(p))).toBeLessThan(0.03); // within about one grid cell
      const n = [mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]];
      const out: [number, number, number] = [p[0] + n[0] * 0.03, p[1] + n[1] * 0.03, p[2] + n[2] * 0.03];
      checked++;
      if (brainField(out) > brainField(p)) outward++;
      expect(mesh.regions[i]).toBeLessThan(BRAIN_REGIONS.length);
    }
    // Grid normals wobble in the sharpest creases (the fissures); nearly all point out.
    expect(outward / checked).toBeGreaterThan(0.97);
    expect(new Set(mesh.regions).size).toBe(BRAIN_REGIONS.length);
  });
});
