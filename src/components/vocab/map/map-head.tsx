import { SectionMark } from "@/components/section-mark";

/**
 * The head of the full-screen Peta Otak: compact, so the map keeps the
 * screen. Chapter mark, title and a line on how to read it (wide screens).
 * The Kosakata tabs and the 2D/3D switch live in the top bar's second row.
 */
export function MapHead({ description }: { description: string }) {
  return (
    <header className="map-head mb-3">
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
    </header>
  );
}
