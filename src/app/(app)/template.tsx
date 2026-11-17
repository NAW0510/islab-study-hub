import { ViewTransition } from "react";

/**
 * Remounts when the section changes (/, /notes, /vocab, …), so moving to
 * another section is an exit and an enter: the old page fades fast, the new
 * one rises a little (globals.css › view transitions). Updates inside a page
 * (saving, refreshing) never animate here.
 */
export default function SectionTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="vt-page-in" exit="vt-page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
