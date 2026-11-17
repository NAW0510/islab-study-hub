"use client";

import { useEffect, type RefObject } from "react";
import { decideWorldMode, probeWebGL2 } from "@/lib/vocab/library/world-mode";

/**
 * Starts the Perpustakaan's WebGL world when the device allows it, and keeps
 * the plain DOM page otherwise. The decision is made once per visit and
 * published on the page as `data-library-world`:
 *
 *   pending  deciding, or the engine is still loading (the DOM page shows)
 *   gl       the world is drawing over the DOM sheets
 *   dom      reduced motion, ?noworld, no hardware WebGL2, a software
 *            renderer, a failed start, a lost context, or frames too slow
 *
 * The engine (three.js and the scene) is a dynamic import started when the
 * browser is idle after the page has shown, so it never weighs on the route's
 * first load or on its largest paint.
 */
export function useLibraryWorld(
  pageRef: RefObject<HTMLElement | null>,
  headRef: RefObject<HTMLElement | null>,
  riverRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const page = pageRef.current;
    const head = headRef.current;
    const river = riverRef.current;
    if (!page || !head || !river) return;

    const mode = decideWorldMode({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      noWorld: new URLSearchParams(window.location.search).has("noworld"),
      ...probeWebGL2(),
    });
    page.dataset.libraryWorld = mode === "gl" ? "pending" : "dom";
    if (mode !== "gl") return;

    let cancelled = false;
    let world: { dispose(): void } | null = null;
    const fallback = () => {
      world?.dispose();
      world = null;
      page.dataset.libraryWorld = "dom";
    };
    const start = () => {
      if (cancelled) return;
      Promise.all([import("./world/engine"), import("./world/layers")])
        .then(([{ createLibraryWorld }, { worldLayers }]) =>
          createLibraryWorld({ page, head, river, onFallback: fallback, layers: worldLayers }),
        )
        .then((created) => {
          if (cancelled) return created.dispose();
          world = created;
          page.dataset.libraryWorld = "gl";
        })
        .catch(() => {
          if (!cancelled) page.dataset.libraryWorld = "dom";
        });
    };
    // Idle after the first paint; a timeout so a busy (or hidden) tab still starts.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(start, { timeout: 1200 })
        : window.setTimeout(start, 300);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      world?.dispose();
      delete page.dataset.libraryWorld;
    };
  }, [pageRef, headRef, riverRef]);
}
