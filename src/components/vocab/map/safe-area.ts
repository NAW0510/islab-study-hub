/**
 * The part of a full-screen map's canvas that the floating panels leave free
 * (map-stage.tsx): the head and toolbar on top, the legend on the left (wide
 * screens), the Week slider at the bottom. The maps centre their picture in
 * it, so nothing starts under a panel. All zero outside the full-screen stage.
 */
export type SafeArea = { left: number; top: number; right: number; bottom: number };

export const NO_INSETS: SafeArea = { left: 0, top: 0, right: 0, bottom: 0 };

const GAP = 12;

export function measureSafeArea(canvas: HTMLElement): SafeArea {
  const stage = canvas.closest<HTMLElement>("[data-map-stage]");
  if (!stage) return NO_INSETS;
  const c = canvas.getBoundingClientRect();
  const wide = window.matchMedia("(min-width: 64rem)").matches;
  const below = (el: Element | null) => (el ? Math.max(0, el.getBoundingClientRect().bottom - c.top + GAP) : 0);
  const head = stage.querySelector(".map-head");
  const panels = [...stage.querySelectorAll<HTMLElement>(".map-ui")];
  // Wide: the legend column stands on the left; the toolbar is the top panel. Phone: every panel stacks on top.
  const column = wide ? panels.find((p) => p.querySelector('[aria-label="Legenda bidang"]')) : undefined;
  const top = Math.max(below(head), ...panels.filter((p) => p !== column).map(below));
  const left = column ? Math.max(0, column.getBoundingClientRect().right - c.left + GAP) : 0;
  const week = stage.querySelector(".map-week");
  const bottom = week ? Math.max(0, c.bottom - week.getBoundingClientRect().top + GAP) : 0;
  return { left, top: Math.min(top, c.height * 0.45), right: 0, bottom: Math.min(bottom, c.height * 0.3) };
}
