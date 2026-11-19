import { SectionMark } from "@/components/section-mark";
import { VocabTabs } from "../vocab-tabs";
import { MapViewSwitch } from "./map-view-switch";

/**
 * The head of the full-screen Peta Otak: compact, so the map keeps the
 * screen. Chapter mark, title, a line on how to read it (wide screens), the
 * 2D/3D switch, and the Kosakata tabs as a glass pill (like the Perpustakaan).
 */
export function MapHead({ active, description }: { active: "2d" | "3d"; description: string }) {
  return (
    <header className="map-head mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <SectionMark />
        <h1 className="display mt-2 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-none">
          <span className="sr-only">Peta Otak</span>
          {/* Each letter rises out of its word as the page opens (after labmgm.org). */}
          <span aria-hidden="true" className="map-word">
            {[..."Peta Otak"].map((letter, i) => (
              <span key={i} className="map-letter" style={{ "--i": i } as React.CSSProperties}>
                {letter}
              </span>
            ))}
          </span>
        </h1>
        <p className="mt-2 hidden max-w-xl text-sm text-text-2 md:block">{description}</p>
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <VocabTabs active="map" variant="pill" inline />
        <MapViewSwitch active={active} />
      </div>
    </header>
  );
}
