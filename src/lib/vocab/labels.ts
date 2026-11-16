/**
 * Greedy label placement for the brain map: labels are tried in priority order
 * and one is shown only if its box does not overlap a label already shown.
 * Zooming in spreads the points apart on screen, so more labels fit.
 */
export type LabelBox = {
  id: string;
  /** Screen position of the label's left edge and vertical centre. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Higher wins: selected > hovered > search hit > newest. */
  priority: number;
};

const CELL = 64;

/** Ids of the labels that fit, highest priority first. */
export function placeLabels(labels: readonly LabelBox[], max = Infinity): string[] {
  const shown: string[] = [];
  const grid = new Map<string, LabelBox[]>();
  const sorted = [...labels].sort((a, b) => b.priority - a.priority);

  const cellsOf = (box: LabelBox) => {
    const cells: string[] = [];
    const top = box.y - box.height / 2;
    for (let cx = Math.floor(box.x / CELL); cx <= Math.floor((box.x + box.width) / CELL); cx++) {
      for (let cy = Math.floor(top / CELL); cy <= Math.floor((top + box.height) / CELL); cy++) {
        cells.push(`${cx}:${cy}`);
      }
    }
    return cells;
  };

  const overlaps = (a: LabelBox, b: LabelBox) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y - a.height / 2 < b.y + b.height / 2 &&
    b.y - b.height / 2 < a.y + a.height / 2;

  for (const label of sorted) {
    if (shown.length >= max) break;
    const cells = cellsOf(label);
    const blocked = cells.some((cell) => grid.get(cell)?.some((other) => overlaps(label, other)));
    if (blocked) continue;
    shown.push(label.id);
    for (const cell of cells) {
      const list = grid.get(cell);
      if (list) list.push(label);
      else grid.set(cell, [label]);
    }
  }
  return shown;
}
