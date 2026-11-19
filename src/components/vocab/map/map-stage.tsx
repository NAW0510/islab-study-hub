"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The Peta Otak pages, full screen like the Perpustakaan: the map's canvas
 * (`.map-canvas` inside) becomes a fixed layer over the whole main column,
 * and the page's head, toolbar, legend and Week slider float over it as
 * glass panels (globals.css › map-immersive). Empty parts of the page let
 * the pointer through to the map.
 *
 * Measures where the main column starts (the sidebar folds and unfolds) and
 * how tall the phone's header bar is, as --stage-left and --stage-top.
 */
export function MapStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    const main = root?.closest("main");
    if (!root || !main) return;
    const header = document.querySelector<HTMLElement>("[data-shell-header]");
    const place = () => {
      root.style.setProperty("--stage-left", `${Math.max(0, Math.round(main.getBoundingClientRect().left))}px`);
      root.style.setProperty("--stage-top", `${header && header.offsetParent !== null ? header.offsetHeight : 0}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(main);
    if (header) observer.observe(header);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    // theme-scope: the 3D view sets data-scheme here, and the tokens follow it.
    <div ref={ref} className="map-immersive theme-scope" data-map-stage>
      {children}
    </div>
  );
}
