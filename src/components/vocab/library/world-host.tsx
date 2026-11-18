"use client";

import { useEffect, useRef, type RefObject } from "react";
import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import { decideWorldMode, probeWebGL2 } from "@/lib/vocab/library/world-mode";
import type { LibraryWorld } from "./world/engine";
import { loadLibraryWorld } from "./world-preload";

/**
 * Starts the Perpustakaan's WebGL world when the device allows it, and keeps
 * the plain DOM page otherwise. The decision is made once per visit and
 * published on the page as `data-library-world`:
 *
 *   pending  deciding, or the world is loading or drawing unseen
 *   gl       the world is shown, drawing over the DOM sheets
 *   dom      reduced motion, ?noworld, no hardware WebGL2, a software
 *            renderer, a failed start, a lost context, or frames too slow
 *
 * The entrance: while pending, the river waits on the paper (globals.css),
 * at most entrance.HOLD_MS of visible time; when the world is ready its
 * canvas fades in and its sheets rise. Past the hold the DOM sheets show
 * (`data-library-shown`), and a late world crossfades in over them instead.
 *
 * The engine (three.js and the scene) is a dynamic import (world-preload.ts),
 * usually already started by a link on the way here, so it never weighs on
 * the route's first load. Returns the running world (or null), for the
 * page's transitions and its field theme; `startRef` holds the theme and the
 * route the world should start with.
 */
export function useLibraryWorld(
  pageRef: RefObject<HTMLElement | null>,
  headRef: RefObject<HTMLElement | null>,
  riverRef: RefObject<HTMLElement | null>,
  startRef: RefObject<{ theme: string | null; route: "list" | "detail" }>,
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
    let ready = false;
    let shown = false;
    // Past the hold, the DOM sheets show. Only visible time counts: a hidden tab waits.
    const show = () => {
      if (shown) return;
      shown = true;
      page.dataset.libraryShown = "";
    };
    let holdTimer = 0;
    const onVisible = () => {
      if (document.visibilityState === "visible") show();
    };
    const hold = () => {
      holdTimer = window.setTimeout(() => {
        if (document.visibilityState === "visible") show();
        else document.addEventListener("visibilitychange", onVisible, { once: true });
      }, LIBRARY_CONFIG.entrance.HOLD_MS);
    };
    hold();

    const reveal = () => {
      const world = worldRef.current;
      if (cancelled || !world || !ready) return;
      window.clearTimeout(holdTimer);
      document.removeEventListener("visibilitychange", onVisible);
      world.reveal(!shown);
      if (shown) page.dataset.libraryLate = ""; // crossfade with the DOM sheets already on screen
      show();
      page.dataset.libraryWorld = "gl";
    };
    const fallback = () => {
      worldRef.current?.dispose();
      worldRef.current = null;
      page.dataset.libraryWorld = "dom";
    };

    loadLibraryWorld()
      .then(([{ createLibraryWorld }, { worldLayers }]) =>
        createLibraryWorld({
          page,
          head,
          river,
          onFallback: fallback,
          onReady: () => {
            ready = true;
            reveal();
          },
          layers: worldLayers,
        }),
      )
      .then((created) => {
        if (cancelled) return created.dispose();
        worldRef.current = created;
        created.setTheme(startRef.current.theme);
        created.setRoute(startRef.current.route);
        reveal(); // in case it was ready before this ran
      })
      .catch(() => {
        if (!cancelled) page.dataset.libraryWorld = "dom";
      });

    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer);
      document.removeEventListener("visibilitychange", onVisible);
      worldRef.current?.dispose();
      worldRef.current = null;
      delete page.dataset.libraryWorld;
      delete page.dataset.libraryShown;
      delete page.dataset.libraryLate;
    };
  }, [pageRef, headRef, riverRef, startRef]);

  return worldRef;
}
