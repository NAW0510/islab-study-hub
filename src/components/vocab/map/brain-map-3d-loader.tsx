"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type BrainMap3DComponent from "./brain-map-3d";

/**
 * The 3D map needs WebGL and the browser's storage, so it only renders in the
 * browser. Loading it dynamically keeps three.js out of every other route.
 */
const BrainMap3D = dynamic(() => import("./brain-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="map-canvas card flex h-[min(70dvh,44rem)] min-h-96 items-center justify-center text-sm text-muted" role="status">
      Memuat ruang 3D…
    </div>
  ),
});

export function BrainMap3DLoader(props: ComponentProps<typeof BrainMap3DComponent>) {
  return <BrainMap3D {...props} />;
}
