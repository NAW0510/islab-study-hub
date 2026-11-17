"use client";

import { useEffect, useRef, type RefObject } from "react";
import { decideWorldMode, probeWebGL2 } from "@/lib/vocab/library/world-mode";
import type { LibraryWorld } from "./world/engine";

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
 * first load or on its largest paint. Returns the running world (or null),
 * for the page's transitions and its field theme; `themeRef` holds the theme
 * the world should start with.
 */
export function useLibraryWorld(
  pageRef: RefObject<HTMLElement | null>,
  headRef: RefObject<HTMLElement | null>,
  riverRef: RefObject<HTMLElement | null>,
  themeRef: RefObject<string | null>,
): RefObject<LibraryWorld | null> {
  const worldRef = useRef<LibraryWorld | null>(null);

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
    const fallback = () => {
      worldRef.current?.dispose();
      worldRef.current = null;
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
          worldRef.current = created;
          created.setTheme(themeRef.current);
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
      worldRef.current?.dispose();
      worldRef.current = null;
      delete page.dataset.libraryWorld;
    };
  }, [pageRef, headRef, riverRef, themeRef]);

  return worldRef;
}
