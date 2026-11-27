"use client";

import { memo, useMemo } from "react";
import { ATLAS_CONFIG } from "@/lib/study/atlas/config";
import type { AtlasData } from "@/lib/study/atlas/geo";

const { LAT_TOP, LAT_BOTTOM } = ATLAS_CONFIG.map;
const W = 3600;
const H = ((LAT_TOP - LAT_BOTTOM) / 360) * W;
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

/**
 * The atlas without the hologram (reduced motion, no WebGL2, a software
 * renderer): the same map as flat SVG. Lit countries take their language's
 * colour; a click picks a country. The country list beside it stays the
 * keyboard's way in.
 */
export const AtlasSvg = memo(function AtlasSvg({
  data,
  lit,
  selected,
  highlighted,
  onPick,
}: {
  data: AtlasData;
  lit: ReadonlyMap<string, string>;
  selected: string | null;
  highlighted: ReadonlySet<string> | null;
  onPick: (code: string | null) => void;
}) {
  const paths = useMemo(
    () =>
      data.countries.map((c) => {
        let d = "";
        for (const polygon of c.polygons) {
          for (const ring of polygon) {
            for (let i = 0; i < ring.length; i += 2) d += `${i === 0 ? "M" : "L"}${x(ring[i]).toFixed(1)} ${y(ring[i + 1]).toFixed(1)}`;
            d += "Z";
          }
        }
        return { code: c.code, name: c.name, d };
      }),
    [data],
  );
  return (
    <svg viewBox={`0 0 ${W} ${H.toFixed(0)}`} className="atlas-svg" role="img" aria-label="Peta dunia" onClick={() => onPick(null)}>
      {paths.map((p) => {
        const colour = lit.get(p.code);
        return (
          <path
            key={p.code}
            d={p.d}
            fillRule="evenodd"
            data-lit={colour ? "" : undefined}
            data-selected={selected === p.code || undefined}
            data-highlight={highlighted?.has(p.code) || undefined}
            style={colour ? { fill: colour } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onPick(p.code);
            }}
          >
            <title>{p.name}</title>
          </path>
        );
      })}
    </svg>
  );
});
