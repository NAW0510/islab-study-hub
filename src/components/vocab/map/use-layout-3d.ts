"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VocabDomain } from "@/lib/types";
import type { Layout3dMessage, Layout3dRequest } from "@/lib/vocab/layout/umap3d.worker";
import { fingerprint, readCache, readPrevious, termGroups, writeCache, type Layout3dData } from "@/lib/vocab/map3d-model";
import { fieldOf, type MapPoint } from "@/lib/vocab/map-model";

export type Layout3dState =
  | { phase: "ready"; data: Layout3dData; ms: number | null }
  | { phase: "loading" }
  | { phase: "computing"; progress: number }
  | { phase: "error"; message: string };

type EmbeddingRow = { id: string; embedding: number[] };

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Everything the 3D views need for the given terms. With an up-to-date cache
 * it is ready on the first render; otherwise the vectors are fetched and laid
 * out in a Web Worker, starting from the cached (older) cube layout when there
 * is one.
 *
 * Only used by a component loaded with `ssr: false`, so `window` exists while rendering.
 */
export function useLayout3d(points: readonly MapPoint[], domains: ReadonlyMap<string, VocabDomain>) {
  const key = useMemo(() => fingerprint(points, (id) => (id ? (fieldOf(id, domains)?.id ?? null) : null)), [points, domains]);
  const groupsById = useMemo(() => new Map(points.map((p) => [p.id, termGroups(p.domain_id, domains)])), [points, domains]);
  const [cached] = useState(() => readCache(storage()));
  // The outcome (ready or failed) and the progress before it are kept apart on purpose: the work
  // below restarts when the outcome for this key is missing, and must not restart (and kill its
  // own worker) just because it reported progress.
  type Outcome = Extract<Layout3dState, { phase: "ready" | "error" }>;
  const [outcome, setOutcome] = useState<{ key: string; value: Outcome } | null>(() =>
    cached && cached.fingerprint === key ? { key, value: { phase: "ready", data: cached.data, ms: null } } : null,
  );
  const [progress, setProgress] = useState<{ key: string; value: Layout3dState } | null>(null);

  const done = outcome?.key === key ? outcome.value : null;
  const needsWork = done === null;

  useEffect(() => {
    if (!needsWork) return;
    let alive = true;
    let worker: Worker | null = null;
    const update = (value: Layout3dState) => {
      if (!alive) return;
      if (value.phase === "ready" || value.phase === "error") setOutcome({ key, value });
      else setProgress({ key, value });
    };

    (async () => {
      try {
        // While this runs the hook reports "loading" (no state for this key yet).
        const { data, error } = await createClient().rpc("vocab_embeddings");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as EmbeddingRow[];
        if (!alive) return;

        // Start from the newest cube layout this browser has, so known terms keep their place.
        const previous = readPrevious(storage());
        const request: Layout3dRequest = {
          vectors: rows.map((r) => r.embedding),
          terms: rows.map((r) => ({ id: r.id, ...(groupsById.get(r.id) ?? { fieldId: null, branchKey: null }) })),
          previous: previous ? { positions: rows.map((r) => previous.coords[r.id] ?? null), unitsPerBox: previous.unitsPerBox } : null,
        };

        update({ phase: "computing", progress: 0 });
        const finished = await new Promise<Extract<Layout3dMessage, { type: "done" }>>((resolve, reject) => {
          worker = new Worker(new URL("../../../lib/vocab/layout/umap3d.worker.ts", import.meta.url));
          worker.onmessage = (event: MessageEvent<Layout3dMessage>) => {
            const message = event.data;
            if (message.type === "progress") return update({ phase: "computing", progress: message.value });
            if (message.type === "done") resolve(message);
            else reject(new Error(message.message));
          };
          worker.onerror = (event) => reject(new Error(event.message || "Worker gagal dimuat."));
          worker.postMessage(request);
        });

        const { cube, neighbours, roles, brain } = finished.result;
        const layout: Layout3dData = {
          coords: new Map(rows.map((row, i) => [row.id, cube.coords[i]] as const)),
          unitsPerBox: cube.unitsPerBox,
          neighbours: new Map(Object.entries(neighbours)),
          roles: new Map(Object.entries(roles)),
          brain: { slots: brain.slots, slotRegion: brain.slotRegion, slotField: brain.slotField, termSlot: new Map(Object.entries(brain.termSlot)) },
        };
        writeCache(storage(), key, layout);
        update({ phase: "ready", data: layout, ms: finished.ms });
      } catch (error) {
        update({ phase: "error", message: (error as Error).message });
      } finally {
        (worker as Worker | null)?.terminate();
      }
    })();

    return () => {
      alive = false;
      (worker as Worker | null)?.terminate();
    };
  }, [key, needsWork, groupsById]);

  return {
    state: done ?? (progress?.key === key ? progress.value : ({ phase: "loading" } as Layout3dState)),
    /** After an error: forget it, so the layout is fetched and computed again. */
    retry: () => {
      setProgress(null);
      setOutcome(null);
    },
  };
}
