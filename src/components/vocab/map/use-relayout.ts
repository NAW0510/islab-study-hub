"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VocabDomain } from "@/lib/types";
import type { LayoutParams } from "@/lib/vocab/layout/config";
import { boxFit, type Point } from "@/lib/vocab/layout/normalize";
import { randomSeed } from "@/lib/vocab/layout/prng";
import { alignLayout } from "@/lib/vocab/layout/procrustes";
import type { LayoutMessage, LayoutRequest } from "@/lib/vocab/layout/umap.worker";
import { fieldOf } from "@/lib/vocab/map-model";

export type RelayoutState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "computing"; progress: number }
  | { phase: "saving" }
  | { phase: "error"; message: string };

type EmbeddingRow = { id: string; domain_id: string | null; domain_source: string; embedding: number[] };

/** Where a term sits on the current map, and whether a layout put it there (true) or kNN placement (false). */
export type PlacedPoint = { at: Point; fromLayout: boolean };

export type RelayoutResult = { coords: Map<string, Point>; params: LayoutParams; ms: number };

/**
 * "Susun ulang": fetch the vectors, lay them out in a Web Worker (umap-js only
 * lives in that worker's chunk), align the result to the current map and save
 * it in one RPC. Nothing here runs until the user presses the button.
 */
export function useRelayout(options: {
  current: ReadonlyMap<string, PlacedPoint>;
  domains: ReadonlyMap<string, VocabDomain>;
  /** Parameters of the layout that produced the current map (from the profile). */
  storedParams: LayoutParams | null;
}) {
  const [state, setState] = useState<RelayoutState>({ phase: "idle" });
  // The parameters of a layout made in this tab are newer than what the server rendered with.
  const [latestParams, setLatestParams] = useState<LayoutParams | null>(null);
  const { current, domains } = options;
  const params = latestParams ?? options.storedParams;

  const run = useCallback(
    async ({ supervised, fresh = false }: { supervised: boolean; fresh?: boolean }): Promise<RelayoutResult | null> => {
      try {
        setState({ phase: "loading" });
        const supabase = createClient();
        const { data, error } = await supabase.rpc("vocab_embeddings");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as EmbeddingRow[];
        if (rows.length === 0) throw new Error("Belum ada istilah yang selesai diproses.");

        // "Rapikan per bidang": only choices the user made or confirmed may steer the layout.
        const fieldIds: string[] = [];
        const labels = supervised
          ? rows.map((row) => {
              if (row.domain_source !== "confirmed" && row.domain_source !== "manual") return -1;
              const field = fieldOf(row.domain_id, domains);
              if (!field) return -1;
              if (!fieldIds.includes(field.id)) fieldIds.push(field.id);
              return fieldIds.indexOf(field.id);
            })
          : null;

        const request: LayoutRequest = {
          vectors: rows.map((r) => r.embedding),
          seed: params?.seed ?? randomSeed(),
          labels,
          // Start from the current map, unless a layout from scratch was asked for.
          previous: fresh
            ? null
            : {
                positions: rows.map((r) => current.get(r.id)?.at ?? null),
                fromLayout: rows.map((r) => current.get(r.id)?.fromLayout ?? false),
                params,
              },
        };

        setState({ phase: "computing", progress: 0 });
        const done = await new Promise<Extract<LayoutMessage, { type: "done" }>>((resolve, reject) => {
          const worker = new Worker(new URL("../../../lib/vocab/layout/umap.worker.ts", import.meta.url));
          worker.onmessage = (event: MessageEvent<LayoutMessage>) => {
            const message = event.data;
            if (message.type === "progress") return setState({ phase: "computing", progress: message.value });
            worker.terminate();
            if (message.type === "done") resolve(message);
            else reject(new Error(message.message));
          };
          worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || "Worker gagal dimuat."));
          };
          worker.postMessage(request);
        });

        // Keep the map's orientation: align to the current map (rotation, mirror, scale, shift),
        // then make sure everything still fits the box.
        const fresh2d = new Map(rows.map((row, i) => [row.id, done.result.coords[i]] as const));
        const aligned = alignLayout(fresh2d, new Map([...current].map(([id, p]) => [id, p.at])));
        let coords = aligned.coords;
        let scale = Math.hypot(aligned.transform.a, aligned.transform.c);
        if ([...coords.values()].some(([x, y]) => Math.abs(x) > 1 || Math.abs(y) > 1)) {
          const ids = [...coords.keys()];
          const fitted = boxFit([...coords.values()]);
          coords = new Map(ids.map((id, i) => [id, fitted.points[i]]));
          scale *= fitted.scale;
        }

        setState({ phase: "saving" });
        const result = done.result.params;
        const saved: LayoutParams = {
          ...result,
          // The alignment rescaled the map, so "UMAP units per map unit" changes with it.
          ...(result.unitsPerBox && scale > 0 ? { unitsPerBox: Number((result.unitsPerBox / scale).toFixed(4)) } : {}),
        };
        const { error: saveError } = await supabase.rpc("save_vocab_layout", {
          p_coords: [...coords].map(([id, [x, y]]) => ({ id, x: Number(x.toFixed(5)), y: Number(y.toFixed(5)) })),
          p_params: saved,
        });
        if (saveError) throw new Error(saveError.message);

        setLatestParams(saved);
        setState({ phase: "idle" });
        return { coords, params: saved, ms: done.ms };
      } catch (error) {
        setState({ phase: "error", message: (error as Error).message });
        return null;
      }
    },
    [current, domains, params],
  );

  return { state, run, params, busy: state.phase === "loading" || state.phase === "computing" || state.phase === "saving" };
}
