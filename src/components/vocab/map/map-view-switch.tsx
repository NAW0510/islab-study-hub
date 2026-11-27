"use client";

import Link from "next/link";
import { SlideGroup } from "../../slide-group";
import { preloadMap3d } from "./preload";

const VIEWS = [
  { key: "2d", href: "/studi/istilah/peta", label: "2D", title: "Peta datar dengan wilayah per bidang" },
  { key: "3d", href: "/studi/istilah/peta/3d", label: "3D", title: "Ruang tiga dimensi yang bisa diputar" },
] as const;

/**
 * The 2D/3D switch of the Peta Otak, in the top bar's second row
 * (navbar.tsx). Heading for 3D starts loading its scenes.
 */
export function MapViewSwitch({ active }: { active: (typeof VIEWS)[number]["key"] }) {
  return (
    <nav aria-label="Tampilan Peta Otak">
      <SlideGroup className="segmented segmented-sm">
        {VIEWS.map((view) => {
          const intent = view.key === "3d" && active !== "3d" ? preloadMap3d : undefined;
          return (
            <Link
              key={view.key}
              href={view.href}
              title={view.title}
              aria-current={view.key === active ? "page" : undefined}
              className="segmented-item"
              onPointerEnter={intent}
              onFocus={intent}
              onPointerDown={intent}
            >
              {view.label}
            </Link>
          );
        })}
      </SlideGroup>
    </nav>
  );
}
