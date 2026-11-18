import type { ReactNode } from "react";

/**
 * The Peta Otak pages, full screen like the Perpustakaan: the map's canvas
 * (`.map-canvas` inside) becomes a fixed layer over the whole screen, under
 * the app's glass top bar, and the page's head, toolbar, legend and Week
 * slider float over it as glass panels (globals.css › map-immersive). Empty
 * parts of the page let the pointer through to the map.
 *
 * theme-scope: a 3D view sets its own scheme on <html> (data-map-scheme), and
 * the tokens here follow it, like the top bar's.
 */
export function MapStage({ children }: { children: ReactNode }) {
  return (
    <div className="map-immersive theme-scope" data-map-stage>
      {children}
    </div>
  );
}
