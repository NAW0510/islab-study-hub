/// <reference lib="webworker" />
import { runLayout3d, type Layout3dResult, type Previous3d } from "./run-layout-3d";

/**
 * Web Worker for the 3D brain map: computes the 3D layout off the main thread.
 * Started only when the 3D view has no up-to-date cached layout:
 *
 *   new Worker(new URL("./umap3d.worker.ts", import.meta.url))
 */
export type Layout3dRequest = { vectors: number[][]; previous: Previous3d | null };
export type Layout3dMessage =
  | { type: "progress"; value: number }
  | { type: "done"; result: Layout3dResult; ms: number }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<Layout3dRequest>) => {
  const started = performance.now();
  try {
    const result = runLayout3d({
      vectors: event.data.vectors,
      previous: event.data.previous,
      onProgress: (value) => self.postMessage({ type: "progress", value } satisfies Layout3dMessage),
    });
    self.postMessage({ type: "done", result, ms: Math.round(performance.now() - started) } satisfies Layout3dMessage);
  } catch (error) {
    self.postMessage({ type: "error", message: (error as Error).message } satisfies Layout3dMessage);
  }
};
