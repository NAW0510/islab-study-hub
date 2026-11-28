import { BrainScene } from "./brain";
import type { ViewScene } from "./common";
import { CubeScene } from "./cube";
import { SpaceScene } from "./space";
import { VIEWS, type View3d, type ViewInfo } from "./views";

export { defaultView, VIEW_KEYS, VIEWS, viewInfo, type View3d, type ViewInfo } from "./views";

/**
 * Every look of the 3D brain map with its scene: the list in views.ts (what
 * the shells show) plus the class that draws it. See views.ts for how to add
 * a visualisation.
 */
export type ViewDefinition = ViewInfo & { create: () => ViewScene };

const SCENES: Record<View3d, () => ViewScene> = {
  space: () => new SpaceScene(),
  brain: () => new BrainScene(),
  cube: () => new CubeScene(),
};

export const VIEWS_3D = VIEWS.map((v) => ({ ...v, create: SCENES[v.key] }));

export function viewDefinition(key: View3d): ViewDefinition {
  return VIEWS_3D.find((v) => v.key === key) ?? VIEWS_3D[0];
}
