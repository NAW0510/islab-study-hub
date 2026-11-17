"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Point3 } from "@/lib/vocab/layout/run-layout-3d";
import type { Layout3dMessage, Layout3dRequest } from "@/lib/vocab/layout/umap3d.worker";
import { fingerprint, readCache, writeCache, type Cached3d } from "@/lib/vocab/map3d-model";
import type { MapPoint } from "@/lib/vocab/map-model";

export type Layout3dState =
  | { phase: "ready"; coords: Map<string, Point3>; ms: number | null }
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

const toMap = (coords: Record<string, Point3>) => new Map(Object.entries(coords));

/**
 * The 3D layout for the given terms. With an up-to-date cache it is ready on
 * the first render; otherwise the vectors are fetched and laid out in a Web
 * Worker, starting from the cached (older) layout when there is one.
 *
 * Only used by a component loaded with `ssr: false`, so `window` exists while rendering.
 */
export function useLayout3d(points: readonly MapPoint[]) {
  const key = useMemo(() => fingerprint(points), [points]);
  const [cached] = useState<Cached3d | null>(() => readCache(storage()));
  const [state, setState] = useState<{ key: string; value: Layout3dState } | null>(() =>
    cached && cached.fingerprint === key ? { key, value: { phase: "ready", coords: toMap(cached.coords), ms: null } } : null,
  );

  const current = state?.key === key ? state.value : null;
  const needsWork = current === null;

  useEffect(() => {
    if (!needsWork) return;
    let alive = true;
    let worker: Worker | null = null;
    const update = (value: Layout3dState) => alive && setState({ key, value });

    (async () => {
      try {
        // While this runs the hook reports "loading" (no state for this key yet).
        const { data, error } = await createClient().rpc("vocab_embeddings");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as EmbeddingRow[];
        if (!alive) return;

        // Start from the newest layout this browser has, so known terms keep their place.
        const previousCache = readCache(storage());
        const request: Layout3dRequest = {
          vectors: rows.map((r) => r.embedding),
          previous: previousCache
            ? { positions: rows.map((r) => previousCache.coords[r.id] ?? null), unitsPerBox: previousCache.unitsPerBox }
            : null,
        };

        update({ phase: "computing", progress: 0 });
        const done = await new Promise<Extract<Layout3dMessage, { type: "done" }>>((resolve, reject) => {
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

        const coords = Object.fromEntries(rows.map((row, i) => [row.id, done.result.coords[i]] as const));
        writeCache(storage(), { fingerprint: key, unitsPerBox: done.result.unitsPerBox, coords });
        update({ phase: "ready", coords: toMap(coords), ms: done.ms });
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
  }, [key, needsWork]);

  return {
    state: current ?? ({ phase: "loading" } as Layout3dState),
    /** After an error: forget it, so the layout is fetched and computed again. */
    retry: () => setState(null),
  };
}
