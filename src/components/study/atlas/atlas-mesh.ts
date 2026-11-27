import { ShapeUtils, Vector2 } from "three";
import { project, type AtlasData } from "@/lib/study/atlas/geo";

/**
 * The hologram's heavy geometry, built once per visit ahead of time (on the
 * way to the Bahasa book, see atlas-load.ts), so opening the book does not
 * stop the page while some 29,000 points are triangulated:
 *
 *   fill            triangles of every country, in the map's local plane
 *   fillCountry     each vertex's country index (the shader looks up its state)
 *   segments        every border as line segments, [x0, y0, z0, x1, y1, z1, …]
 *   segmentCountry  each segment's country index
 */
export type AtlasMesh = {
  fill: Float32Array;
  fillCountry: Float32Array;
  segments: Float32Array;
  segmentCountry: Uint16Array;
};

export function buildAtlasMesh(data: AtlasData): AtlasMesh {
  const fill: number[] = [];
  const fillCountry: number[] = [];
  const segments: number[] = [];
  const segmentCountry: number[] = [];
  data.countries.forEach((country, index) => {
    for (const polygon of country.polygons) {
      const rings = polygon.map((ring) => {
        const pts: Vector2[] = [];
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = project(ring[i], ring[i + 1]);
          pts.push(new Vector2(x, y));
        }
        return pts;
      });
      const [outer, ...holes] = rings;
      const flat = [...outer, ...holes.flat()];
      for (const [a, b, c] of ShapeUtils.triangulateShape(outer, holes)) {
        for (const k of [a, b, c]) {
          fill.push(flat[k].x, flat[k].y, 0);
          fillCountry.push(index);
        }
      }
      for (const pts of rings) {
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const q = pts[(i + 1) % pts.length];
          segments.push(p.x, p.y, 0.002, q.x, q.y, 0.002);
          segmentCountry.push(index);
        }
      }
    }
  });
  return {
    fill: new Float32Array(fill),
    fillCountry: new Float32Array(fillCountry),
    segments: new Float32Array(segments),
    segmentCountry: Uint16Array.from(segmentCountry),
  };
}
