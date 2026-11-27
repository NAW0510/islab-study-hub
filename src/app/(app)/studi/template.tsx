import { ViewTransition } from "react";

/**
 * Remounts when moving between the Ruang Studi's parts (Perpustakaan,
 * Istilah Teknis, Bahasa), which share one section and so one (app)
 * template: the old page fades out and the new one fades in, in place,
 * while the tab pill slides in the top bar. Istilah Teknis has its own
 * template for its Daftar, Peta Otak and Domain (istilah/template.tsx).
 */
export default function StudyTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="vt-swap" exit="vt-swap" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
