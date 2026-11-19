import type * as THREE from "three";
import { CoverLayer } from "./cover";
import { CursorRing } from "./cursor";
import type { WorldLayer } from "./engine";
import { LibraryLayer } from "./library";
import type { ColorReader } from "./palette";
import { Particles } from "./particles";

/**
 * The layers drawn around the cards: the library itself, a term page's
 * water cover, drifting paper and dust, and the cursor ring. Kept in one
 * list so the engine stays the same as layers are added.
 */
export function worldLayers(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  reader: () => ColorReader,
): WorldLayer[] {
  const host = canvas.parentElement ?? document.body;
  const river = host.querySelector<HTMLElement>("[data-library-river]");
  const layers: WorldLayer[] = [];
  if (river) layers.push(new LibraryLayer(scene, camera, river, canvas));
  layers.push(new CoverLayer(scene, host, canvas, reader));
  layers.push(new Particles(scene));
  // The ring only for a mouse; touch keeps its own feedback.
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) layers.push(new CursorRing(host));
  return layers;
}
