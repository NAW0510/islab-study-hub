"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type BrainMapComponent from "./brain-map";

/**
 * The map measures its container and draws with d3, so it only makes sense in
 * the browser. Loading it dynamically also keeps d3 out of every other route.
 */
const BrainMap = dynamic(() => import("./brain-map"), {
  ssr: false,
  loading: () => (
    <div className="map-canvas card flex h-[min(70dvh,44rem)] min-h-96 items-center justify-center text-sm text-muted" role="status">
      Memuat peta…
    </div>
  ),
});

export function BrainMapLoader(props: ComponentProps<typeof BrainMapComponent>) {
  return <BrainMap {...props} />;
}
