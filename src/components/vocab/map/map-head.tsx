/**
 * The Peta Otak has no visible head: the active "Peta Otak" tab in the top
 * bar names the page, the tools sit in the bar, and the line on how to read
 * the map lives in its info panel, so the map keeps the whole screen. The
 * heading stays for screen readers and the page outline.
 */
export function MapHead() {
  return <h1 className="sr-only">Peta Otak</h1>;
}
