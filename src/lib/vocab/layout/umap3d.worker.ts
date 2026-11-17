/// <reference lib="webworker" />
import { brainLayout } from "../brain-model";
import { assignRoles, topNeighbours, type Role } from "../space-model";
import { unitNormalize } from "./normalize";
import { runLayout3d, type Layout3dResult, type Point3, type Previous3d } from "./run-layout-3d";

/**
 * Web Worker for the 3D brain map: everything the three 3D views need, off
 * the main thread. Started only when the 3D view has no up-to-date cache:
 *
 *   new Worker(new URL("./umap3d.worker.ts", import.meta.url))
 *
 *   cube   UMAP 3D positions (run-layout-3d.ts)
 *   space  planet / moon / rock per term (space-model.ts)
 *   brain  neuron slots and the slot of every term (brain-model.ts)
 *   both   the two most similar terms of each term
 */
export type Term3d = {
  id: string;
  /** Top-level field; null without a domain. */
  fieldId: string | null;
  /** Branch key: the branch id, or `${fieldId}:umum` for a term filed directly under a field; null without a domain. */
  branchKey: string | null;
};

export type Layout3dRequest = { vectors: number[][]; terms: Term3d[]; previous: Previous3d | null };

export type Layout3dOutput = {
  cube: Layout3dResult;
  neighbours: Record<string, string[]>;
  roles: Record<string, Role>;
  brain: { slots: Point3[]; slotRegion: number[]; slotField: (string | null)[]; termSlot: Record<string, number> };
};

export type Layout3dMessage =
  | { type: "progress"; value: number }
  | { type: "done"; result: Layout3dOutput; ms: number }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<Layout3dRequest>) => {
  const started = performance.now();
  const { vectors, terms, previous } = event.data;
  const progress = (value: number) => self.postMessage({ type: "progress", value } satisfies Layout3dMessage);
  try {
    // The UMAP run takes most of the time: 0–80% of the progress bar.
    const cube = runLayout3d({ vectors, previous, onProgress: (value) => progress(value * 0.8) });

    const unit = unitNormalize(vectors);
    const near = topNeighbours(unit, 2);
    const neighbours = Object.fromEntries(terms.map((t, i) => [t.id, near[i].map((j) => terms[j].id)]));
    const roles = Object.fromEntries(assignRoles(terms.map((t) => ({ id: t.id, group: t.branchKey })), unit));
    progress(0.9);

    const brain = brainLayout(terms.map((t, i) => ({ id: t.id, fieldId: t.fieldId, at: cube.coords[i] })));
    const result: Layout3dOutput = {
      cube,
      neighbours,
      roles,
      brain: { slots: brain.slots, slotRegion: brain.slotRegion, slotField: brain.slotField, termSlot: Object.fromEntries(brain.termSlot) },
    };
    progress(1);
    self.postMessage({ type: "done", result, ms: Math.round(performance.now() - started) } satisfies Layout3dMessage);
  } catch (error) {
    self.postMessage({ type: "error", message: (error as Error).message } satisfies Layout3dMessage);
  }
};
