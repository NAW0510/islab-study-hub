import { ViewTransition } from "react";

/**
 * Remounts when moving between the Kosakata pages (Daftar, Perpustakaan,
 * Peta Otak, Domain), which share one section and so one (app) template:
 * the old page fades out and the new one fades in, in place, while the tab
 * pill slides in the top bar. 2D ↔ 3D stays inside the Peta Otak's own page
 * and plays its views' intros instead.
 */
export default function VocabTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="vt-swap" exit="vt-swap" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
