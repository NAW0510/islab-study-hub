import * as THREE from "three";
import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import { seedOf } from "@/lib/vocab/library/cover-pattern";
import { awakeCards } from "@/lib/vocab/library/wake";
import { CARD_FRAGMENT, CARD_VERTEX } from "./card-shaders";
import { drawBack, drawFront, type CardFonts } from "./card-texture";
import { coverColors, uiColors, type ColorReader } from "./palette";

/**
 * The river's cards, drawn by the world over their DOM frames.
 *
 * Every card keeps its DOM button (focus, hit area, accessible name); the
 * world draws one sheet per card where the button rests and bends it with
 * the river, and the DOM faces turn transparent once the sheet is drawn
 * (`data-world-drawn`). Only cards near the screen own a mesh and textures
 * (wake.ts); textures are drawn a couple per frame, nearest first, and drawn
 * again when the size or the colour scheme changes. DOM offsets are cached
 * in document space and re-measured on resize, font load and list changes,
 * never per frame.
 */
type Card = {
  id: string;
  item: HTMLElement;
  sheet: HTMLElement;
  seed: number;
  top: number;
  left: number;
  width: number;
  height: number;
  awake: boolean;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null;
  textures: { front: THREE.CanvasTexture; back: THREE.CanvasTexture; key: string } | null;
  flip: number;
  hover: number;
  hoverTarget: number;
  press: number;
  lean: THREE.Vector2;
  rise: number;
  riseDelay: number;
};

export type CardFrame = {
  time: number;
  dt: number;
  scrollY: number;
  scrollSpeed: number;
  viewWidth: number;
  viewHeight: number;
  canvasLeft: number;
  foldLine: number;
  fog: THREE.Color;
  fogDepth: number;
  /** Sideways pan of every sheet during a transition, CSS px. */
  pan: number;
  /** Textures drawn per frame: more while a transition covers the screen. */
  texturesPerFrame: number;
};

const { sheet: SHEET } = LIBRARY_CONFIG;

export class CardsLayer {
  private readonly cards = new Map<string, Card>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1, SHEET.SEGMENTS_X, SHEET.SEGMENTS_Y);
  private awake = new Set<string>();
  private schemeKey = "";
  private firstScan = true;
  private hovered: Card | null = null;
  private readonly cleanups: (() => void)[] = [];
  private canvasLeft = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly river: HTMLElement,
    private readonly reader: ColorReader,
    private readonly fonts: () => CardFonts,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      river.addEventListener(type, fn);
      this.cleanups.push(() => river.removeEventListener(type, fn));
    };
    on("pointerover", (e) => this.setHover(this.cardOf(e.target)));
    on("pointerleave", () => this.setHover(null));
    on("focusin", (e) => this.setHover(this.cardOf(e.target)));
    on("focusout", () => this.setHover(null));
    on("pointermove", (e) => {
      const card = this.cardOf(e.target);
      if (!card) return;
      const r = card.sheet.getBoundingClientRect();
      card.lean.set(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    on("pointerdown", (e) => {
      const card = this.cardOf(e.target);
      if (card) card.press = 1;
    });
  }

  private cardOf(target: EventTarget | null): Card | null {
    const item = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-library-card]");
    return item ? (this.cards.get(item.dataset.termId ?? "") ?? null) : null;
  }

  private setHover(card: Card | null) {
    if (this.hovered && this.hovered !== card) this.hovered.hoverTarget = 0;
    this.hovered = card;
    if (card) card.hoverTarget = 1;
  }

  /** Picks up the river's cards (after a filter or a re-render): new ones rise, gone ones are freed. */
  scan() {
    const seen = new Set<string>();
    const items = this.river.querySelectorAll<HTMLElement>("[data-library-card]");
    items.forEach((item, index) => {
      const id = item.dataset.termId;
      const sheet = item.querySelector<HTMLElement>(".library-sheet");
      if (!id || !sheet) return;
      seen.add(id);
      const known = this.cards.get(id);
      if (known && known.item === item) return;
      if (known) this.sleep(known);
      const row = Math.floor(index / 2);
      this.cards.set(id, {
        id,
        item,
        sheet,
        seed: (seedOf(id) % 1000) / 1000,
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        awake: false,
        mesh: null,
        textures: null,
        flip: item.hasAttribute("data-flipped") ? 1 : 0,
        hover: 0,
        hoverTarget: 0,
        press: 0,
        lean: new THREE.Vector2(),
        rise: 0,
        riseDelay: this.firstScan ? 0.25 + Math.min(row, 6) * 0.09 : Math.min(row, 6) * 0.05,
      });
    });
    for (const card of [...this.cards.values()]) {
      if (!seen.has(card.id)) {
        this.sleep(card);
        this.cards.delete(card.id);
      }
    }
    this.firstScan = false;
    this.measure(this.canvasLeft);
  }

  /** Re-reads every card's document rect. */
  measure(canvasLeft: number) {
    this.canvasLeft = canvasLeft;
    const scrollY = window.scrollY;
    for (const card of this.cards.values()) {
      const r = card.sheet.getBoundingClientRect();
      card.top = r.top + scrollY;
      card.left = r.left - canvasLeft;
      card.width = r.width;
      card.height = r.height;
    }
  }

  /** The scheme changed: every texture is drawn again. */
  setScheme(key: string) {
    this.schemeKey = key;
  }

  get stats() {
    let drawn = 0;
    for (const c of this.cards.values()) if (c.textures) drawn++;
    return { cards: this.cards.size, awake: this.awake.size, drawn };
  }

  update(frame: CardFrame) {
    const list = [...this.cards.values()];
    this.awake = awakeCards(
      list.map((c) => ({ id: c.id, top: c.top, bottom: c.top + c.height })),
      this.awake,
      frame.scrollY,
      frame.viewHeight,
    );

    // Textures: a few per frame, nearest the middle of the screen first.
    const centre = frame.scrollY + frame.viewHeight / 2;
    const scale = Math.min(SHEET.TEXTURE_SCALE, window.devicePixelRatio || 1);
    const pending = list
      .filter((c) => this.awake.has(c.id) && (!c.textures || c.textures.key !== this.textureKey(c, scale)))
      .sort((a, b) => Math.abs(a.top - centre) - Math.abs(b.top - centre));
    for (const card of pending.slice(0, frame.texturesPerFrame)) this.draw(card, scale);

    const settled = frame.scrollSpeed < 250;
    const follow = (rate: number) => 1 - Math.exp(-frame.dt / rate);
    for (const card of list) {
      if (!this.awake.has(card.id)) {
        if (card.awake) this.sleep(card);
        continue;
      }
      card.awake = true;
      const flipTarget = card.item.hasAttribute("data-flipped") ? 1 : 0;
      card.flip += (flipTarget - card.flip) * follow(SHEET.FLIP / 4);
      // Hover never starts mid-scroll: it waits for the river to settle.
      const hoverTarget = settled || card.hover > 0.01 ? card.hoverTarget : 0;
      card.hover += (hoverTarget - card.hover) * follow(0.16);
      card.press += (0 - card.press) * follow(0.12);
      if (card.rise < 1 && card.textures) {
        card.riseDelay -= frame.dt;
        if (card.riseDelay <= 0) card.rise = Math.min(1, card.rise + frame.dt / 0.9);
      }
      // A sheet folded under the head hides its DOM "Buka detail" button.
      const folded = card.top - frame.scrollY + card.height / 2 < frame.foldLine;
      if (folded !== card.item.hasAttribute("data-folded")) card.item.toggleAttribute("data-folded", folded);
      const mesh = card.mesh;
      if (!mesh) continue;
      const u = mesh.material.uniforms;
      u.uRect.value.set(card.left, card.top - frame.scrollY, card.width, card.height);
      u.uView.value.set(frame.viewWidth, frame.viewHeight);
      u.uFoldLine.value = frame.foldLine;
      u.uFoldZone.value = SHEET.FOLD_ZONE * frame.viewHeight;
      u.uTime.value = frame.time;
      u.uFlip.value = easeInOut(card.flip);
      u.uHover.value = card.hover;
      u.uPress.value = card.press;
      u.uLean.value.copy(card.lean);
      u.uRise.value = easeOut(card.rise);
      u.uFog.value.copy(frame.fog);
      u.uFogDepth.value = frame.fogDepth;
      u.uPan.value = frame.pan;
    }
  }

  private textureKey(card: Card, scale: number) {
    return `${Math.round(card.width)}x${Math.round(card.height)}@${scale}:${this.schemeKey}`;
  }

  private draw(card: Card, scale: number) {
    if (card.width < 4 || card.height < 4) return;
    const colors = uiColors(this.reader);
    const { main, deep } = coverColors(this.reader, card.item.dataset.color ?? "domain-none");
    const data = {
      id: card.id,
      term: card.sheet.querySelector(".library-title .roll > span")?.textContent ?? "",
      meta: card.sheet.querySelector(".library-meta")?.textContent ?? "",
      definition: card.sheet.querySelector(".library-definition")?.textContent ?? "",
      main,
      deep,
    };
    const fonts = this.fonts();
    const texScale = Math.min(scale, SHEET.MAX_TEXTURE / Math.max(card.width, card.height));
    const front = drawFront(data, colors, fonts, card.width, card.height, texScale);
    const back = drawBack(data, colors, fonts, card.width, card.height, texScale);
    const frontTexture = new THREE.CanvasTexture(front.canvas);
    const backTexture = new THREE.CanvasTexture(back.canvas);
    for (const t of [frontTexture, backTexture]) {
      t.anisotropy = 4;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
    }
    card.textures?.front.dispose();
    card.textures?.back.dispose();
    card.textures = { front: frontTexture, back: backTexture, key: this.textureKey(card, scale) };

    if (!card.mesh) {
      const material = new THREE.ShaderMaterial({
        vertexShader: CARD_VERTEX,
        fragmentShader: CARD_FRAGMENT,
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          uRect: { value: new THREE.Vector4() },
          uView: { value: new THREE.Vector2() },
          uFoldLine: { value: 0 },
          uFoldZone: { value: 1 },
          uFoldDepth: { value: SHEET.FOLD_DEPTH },
          uTwist: { value: SHEET.FOLD_TWIST },
          uWobble: { value: SHEET.FOLD_WOBBLE },
          uSwell: { value: SHEET.SWELL },
          uSwellWave: { value: SHEET.SWELL_WAVELENGTH },
          uSwellPeriod: { value: SHEET.SWELL_PERIOD },
          uTime: { value: 0 },
          uSeed: { value: card.seed },
          uFlip: { value: 0 },
          uHover: { value: 0 },
          uPress: { value: 0 },
          uLean: { value: new THREE.Vector2() },
          uRise: { value: 0 },
          uFront: { value: frontTexture },
          uBack: { value: backTexture },
          uFog: { value: new THREE.Color() },
          uFogDepth: { value: 2600 },
          uCoverFraction: { value: front.coverFraction },
          uPan: { value: 0 },
        },
      });
      card.mesh = new THREE.Mesh(this.geometry, material);
      card.mesh.frustumCulled = false;
      this.scene.add(card.mesh);
    } else {
      card.mesh.material.uniforms.uFront.value = frontTexture;
      card.mesh.material.uniforms.uBack.value = backTexture;
      card.mesh.material.uniforms.uCoverFraction.value = front.coverFraction;
    }
    card.item.setAttribute("data-world-drawn", "");
  }

  private sleep(card: Card) {
    card.awake = false;
    card.item.removeAttribute("data-world-drawn");
    card.item.removeAttribute("data-folded");
    if (card.mesh) {
      this.scene.remove(card.mesh);
      card.mesh.material.dispose();
      card.mesh = null;
    }
    if (card.textures) {
      card.textures.front.dispose();
      card.textures.back.dispose();
      card.textures = null;
    }
    // A card that comes back later is simply there, without the entrance.
    card.rise = 1;
  }

  dispose() {
    for (const fn of this.cleanups) fn();
    for (const card of this.cards.values()) this.sleep(card);
    this.cards.clear();
    this.geometry.dispose();
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
