/// <reference lib="webworker" />
import { buildBrainMesh, type BrainMesh } from "../brain-mesh";

/**
 * Web Worker that builds the cortex surface of the "Otak" view (see
 * brain-mesh.ts). It does not depend on the terms, so it runs once per page
 * visit, off the main thread:
 *
 *   new Worker(new URL("./brain-mesh.worker.ts", import.meta.url))
 */
export type { BrainMesh };
export type BrainMeshRequest = { resolution: number };
export type BrainMeshMessage = { type: "done"; mesh: BrainMesh; ms: number } | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<BrainMeshRequest>) => {
  const started = performance.now();
  try {
    const mesh = buildBrainMesh(event.data.resolution);
    self.postMessage({ type: "done", mesh, ms: Math.round(performance.now() - started) } satisfies BrainMeshMessage, [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.regions.buffer,
      mesh.folds.buffer,
    ]);
  } catch (error) {
    self.postMessage({ type: "error", message: (error as Error).message } satisfies BrainMeshMessage);
  }
};
