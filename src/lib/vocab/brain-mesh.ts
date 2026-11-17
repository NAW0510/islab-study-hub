import { MeshBasicMaterial } from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { BRAIN_BOUNDS, brainField, gyri, regionOf } from "./brain-model";

export type BrainMesh = {
  /** Triangle soup in world units (three vertices per triangle). */
  positions: Float32Array;
  normals: Float32Array;
  /** Lobe of every vertex (index in BRAIN_REGIONS). */
  regions: Uint8Array;
  /** Fold field at every vertex: positive on gyri, negative in sulci (for shading the grooves darker). */
  folds: Float32Array;
};

/**
 * The cortex surface of the "Otak" view: the brain's distance field sampled
 * on a `resolution`³ grid, and the surface extracted with marching cubes
 * (three.js). Runs in a worker (brain-mesh.worker.ts) and in tests.
 */
export function buildBrainMesh(resolution: number): BrainMesh {
  const res = resolution;
  const cubes = new MarchingCubes(res, new MeshBasicMaterial(), false, false, 260000);
  // Marching cubes treats "inside" as field > isolation: use minus the signed distance.
  cubes.isolation = 0;
  const { centre, half } = BRAIN_BOUNDS;
  const h = cubes.halfsize;
  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        cubes.field[x + y * res + z * res * res] = -brainField([centre[0] + ((x - h) / h) * half, centre[1] + ((y - h) / h) * half, centre[2] + ((z - h) / h) * half]);
      }
    }
  }
  cubes.update();

  const count = cubes.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const regions = new Uint8Array(count);
  const folds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p: [number, number, number] = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      p[a] = centre[a] + cubes.positionArray[i * 3 + a] * half;
      positions[i * 3 + a] = p[a];
    }
    const nx = cubes.normalArray[i * 3];
    const ny = cubes.normalArray[i * 3 + 1];
    const nz = cubes.normalArray[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / l;
    normals[i * 3 + 1] = ny / l;
    normals[i * 3 + 2] = nz / l;
    regions[i] = regionOf(p);
    folds[i] = gyri(p);
  }
  cubes.geometry.dispose();
  return { positions, normals, regions, folds };
}
