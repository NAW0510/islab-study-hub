import * as THREE from "three";
import type { LayerFrame, WorldLayer } from "./engine";
import { drawCover } from "./card-texture";
import { coverColors, uiColors, type ColorReader } from "./palette";

/**
 * A term page's cover as a sheet of water, drawn by the world over the
 * cover's DOM frame (1 world unit = 1 CSS px on the card plane), after the
 * Articles page of labmgm.org.
 *
 * One height field (CSS px toward the reader) feeds both shaders, so the
 * sheet lifts where the light bends:
 *   emergence  a wave front sweeps across (left to right, a little up from
 *              the bottom). Ahead of it the picture is still under the sea;
 *              the crest lifts with foam; behind it the wake rocks and dies
 *              away while the picture, still wet and tinted, clears;
 *   swell      two slow crossing waves keep the settled surface breathing;
 *   ripples    rings from the pointer's path and splashes from clicks (a
 *              ring buffer of eight), spreading and fading.
 * The picture is refracted along the slope, split into its channels where
 * the water is steep, and given a small sheen.
 */
const HEIGHT = /* glsl */ `
uniform vec4 uRect;
uniform float uTime;
uniform float uStart;
uniform vec4 uRipples[8];

float frontAt(vec2 px) {
  // Distance ahead of the front along its direction (positive: still under water).
  float along = px.x + (uRect.w - px.y) * 0.3;
  float travel = (uTime - uStart) / 1.5 * (uRect.z + uRect.w * 0.3 + 360.0) - 180.0;
  return along - travel;
}

float heightAt(vec2 px) {
  float h = 3.0 * sin(px.x * 0.011 + uTime * 0.8) + 2.0 * sin(px.y * 0.019 - uTime * 0.6 + px.x * 0.004);
  float d = frontAt(px);
  h += 26.0 * exp(-pow(d / 42.0, 2.0));
  h += d < 0.0 ? 9.0 * exp(d / 220.0) * sin(d * 0.05 + uTime * 6.0) : -120.0 * smoothstep(0.0, 90.0, d);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 2.4) continue;
    float dist = length(px - r.xy) - age * 230.0;
    h += r.w * 7.0 * exp(-age * 1.5) * exp(-pow(dist / 18.0, 2.0)) * cos(dist * 0.25);
  }
  return h;
}
`;

const VERTEX = /* glsl */ `
${HEIGHT}
uniform vec2 uView;
uniform float uPan;
varying vec2 vUv;
varying vec2 vPx;
varying float vDepth;
void main() {
  vUv = uv;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * uRect.zw;
  vPx = px;
  float z = heightAt(px);
  vec3 world = vec3(uRect.x + px.x - 0.5 * uView.x + uPan, 0.5 * uView.y - (uRect.y + px.y), z);
  vec4 view = modelViewMatrix * vec4(world, 1.0);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = /* glsl */ `
${HEIGHT}
uniform sampler2D uMap;
uniform vec3 uFog;
uniform float uOpacity;
varying vec2 vUv;
varying vec2 vPx;
varying float vDepth;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = vPx;
  float d = frontAt(px);
  if (d > 60.0) discard; // still under the sea
  vec2 slope = vec2(heightAt(px + vec2(1.5, 0.0)) - heightAt(px - vec2(1.5, 0.0)), heightAt(px + vec2(0.0, 1.5)) - heightAt(px - vec2(0.0, 1.5))) / 3.0;
  vec2 bend = slope * vec2(1.0, -1.0) * 0.012;
  float steep = clamp(length(slope) * 1.6, 0.0, 1.0);
  vec2 uv = vUv + bend;
  vec2 split = bend * 0.6 * steep;
  vec4 c = vec4(texture2D(uMap, uv + split).r, texture2D(uMap, uv).g, texture2D(uMap, uv - split).b, texture2D(uMap, uv).a);
  if (c.a < 0.02) discard;
  // Wet and tinted just behind the front, clearing as the wake dies.
  float wet = exp(min(d, 0.0) / 260.0);
  c.rgb = mix(c.rgb, c.rgb * vec3(0.82, 0.9, 1.0), wet * 0.5);
  // Foam along the crest, and a little sheen where the surface tilts.
  float foam = exp(-pow(d / 14.0, 2.0)) * (0.55 + 0.45 * hash(floor(px / 3.0) + floor(uTime * 20.0)));
  vec3 n = normalize(vec3(-slope * 2.2, 1.0));
  float sheen = pow(max(dot(n, normalize(vec3(-0.35, 0.5, 0.8))), 0.0), 40.0) * 0.35;
  c.rgb += vec3(foam * 0.85 + sheen);
  float fade = smoothstep(60.0, 0.0, d);
  // Fog only past the card plane (the camera stands 2000 px in front of it), so the cover keeps its paper.
  float fog = clamp((vDepth - 2100.0) / 9000.0, 0.0, 1.0);
  gl_FragColor = vec4(mix(c.rgb, uFog, fog), c.a * fade * uOpacity);
}
`;

export class CoverLayer implements WorldLayer {
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private texture: THREE.CanvasTexture | null = null;
  private coverId = "";
  private sizeKey = "";
  private element: HTMLElement | null = null;
  private rippleIndex = 0;
  private lastRipple = 0;
  private clock = 0;
  private schemeKey = "";
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly page: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly reader: () => ColorReader,
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 96, 40),
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        uniforms: {
          uRect: { value: new THREE.Vector4() },
          uView: { value: new THREE.Vector2() },
          uTime: { value: 0 },
          uStart: { value: 0 },
          uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
          uMap: { value: null },
          uFog: { value: new THREE.Color() },
          uOpacity: { value: 1 },
          uPan: { value: 0 },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    const ripple = (x: number, y: number, strength: number) => {
      const el = this.element;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
      const slot = this.mesh.material.uniforms.uRipples.value[this.rippleIndex] as THREE.Vector4;
      slot.set(x - r.left, y - r.top, this.clock, strength);
      this.rippleIndex = (this.rippleIndex + 1) % 8;
    };
    const onMove = (e: PointerEvent) => {
      if (this.clock - this.lastRipple < 0.09) return;
      this.lastRipple = this.clock;
      ripple(e.clientX, e.clientY, 0.6);
    };
    const onDown = (e: PointerEvent) => ripple(e.clientX, e.clientY, 1.8);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    this.cleanups.push(() => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    });
  }

  setScheme(scheme: string) {
    this.schemeKey = scheme;
  }

  update(frame: LayerFrame) {
    this.clock = frame.time;
    const el = this.page.querySelector<HTMLElement>("[data-library-cover]");
    if (el !== this.element) {
      this.element?.removeAttribute("data-world-drawn");
      this.element = el;
    }
    if (!el) {
      this.mesh.visible = false;
      return;
    }
    const r = el.getBoundingClientRect();
    const canvasLeft = this.canvas.getBoundingClientRect().left;
    const id = el.dataset.coverId ?? "";
    const key = `${Math.round(r.width)}x${Math.round(r.height)}:${this.schemeKey}`;
    const u = this.mesh.material.uniforms;
    if (id !== this.coverId || key !== this.sizeKey) {
      if (r.width < 4 || r.height < 4) return;
      const reader = this.reader();
      const { main, deep } = coverColors(reader, el.dataset.color ?? "domain-none");
      const scale = Math.min(2, window.devicePixelRatio || 1, 2400 / r.width);
      const canvas = drawCover({ id, main, deep }, uiColors(reader).paper, r.width, r.height, scale);
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.anisotropy = 4;
      u.uMap.value = this.texture;
      if (id !== this.coverId) {
        u.uStart.value = frame.time + 0.35; // the wave starts as the page settles in
        for (const slot of u.uRipples.value as THREE.Vector4[]) slot.w = 0;
      }
      this.coverId = id;
      this.sizeKey = key;
      el.setAttribute("data-world-drawn", "");
    }
    u.uRect.value.set(r.left - canvasLeft, r.top, r.width, r.height);
    u.uView.value.set(frame.viewWidth, frame.viewHeight);
    u.uTime.value = frame.time;
    u.uFog.value.copy(frame.fog);
    u.uPan.value = frame.pan;
    this.mesh.visible = r.bottom > -200 && r.top < frame.viewHeight + 200;
  }

  dispose() {
    for (const fn of this.cleanups) fn();
    this.element?.removeAttribute("data-world-drawn");
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture?.dispose();
  }
}
