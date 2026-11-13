import type { ReactNode } from "react";

/**
 * Label that rolls upward when its link or button is hovered or focused, with
 * a copy sliding in from below. The copy is hidden from assistive technology
 * so the label is read once. Styles: `.roll` in globals.css (transform only;
 * static without hover or with reduced motion).
 */
export function RollText({ children }: { children: ReactNode }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}
