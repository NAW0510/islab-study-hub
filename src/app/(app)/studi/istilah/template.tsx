import { ViewTransition } from "react";

/**
 * Remounts when moving between Istilah Teknis' pages (Daftar, Peta Otak,
 * Domain): the same quick crossfade as the Ruang Studi's parts. 2D ↔ 3D
 * stays inside the Peta Otak's own segment and plays its views' intros
 * instead.
 */
export default function TermsTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="vt-swap" exit="vt-swap" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
