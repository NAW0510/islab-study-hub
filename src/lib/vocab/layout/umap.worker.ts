/// <reference lib="webworker" />
import { runLayout, type LayoutResult, type PreviousLayout } from "./run-layout";

/**
 * Web Worker entry: computes the map layout off the main thread so the page
 * stays responsive. Started only when "Susun ulang" is pressed:
 *
 *   new Worker(new URL("./umap.worker.ts", import.meta.url))
 */
export type LayoutRequest = { vectors: number[][]; seed: number; labels: number[] | null; previous: PreviousLayout | null };
export type LayoutMessage =
  | { type: "progress"; value: number }
  | { type: "done"; result: LayoutResult; ms: number }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const started = performance.now();
  try {
    const result = runLayout({
      ...event.data,
      onProgress: (value) => self.postMessage({ type: "progress", value } satisfies LayoutMessage),
    });
    self.postMessage({ type: "done", result, ms: Math.round(performance.now() - started) } satisfies LayoutMessage);
  } catch (error) {
    self.postMessage({ type: "error", message: (error as Error).message } satisfies LayoutMessage);
  }
};
