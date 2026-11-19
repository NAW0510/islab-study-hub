import * as THREE from "three";

/**
 * The screen pass: the scene, rendered to a target, drawn to the canvas
 * through a lens.
 *
 * - Lens: barrel distortion plus dispersion. Ten taps along the dispersion,
 *   each weighted toward one wavelength (red not displaced, blue the most),
 *   so the corners fringe smoothly into red and blue instead of showing
 *   three ghost copies. The dispersion grows with r⁴: the middle, where the
 *   sheets' text is read, stays sharp.
 * - Scroll smear: the same taps also spread along the scroll direction, a
 *   short streak (at most about 22 px) that follows the scroll speed. Each
 *   tap's place in the streak is shuffled against its wavelength (golden
 *   ratio steps plus a per-pixel jitter), and every tap reads a mip of the
 *   scene about as coarse as the gap between taps, so the smear reads as one
 *   soft streak, never as a comb of copies or a rainbow.
 * - Pulses: a ring bending the picture outward from a click.
 * - Wipe: a flat colour sweeping across with a soft front, then dissolving;
 *   the shelf ↔ field transitions drive it.
 * - Vignette and animated grain, lighter on the pale day fog.
 * All in display sRGB: no colour conversion anywhere.
 */
const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const TAPS = 10;

const FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uBarrel;
uniform float uDispersion;
uniform float uBlur;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
uniform vec4 uPulse;
uniform vec4 uWipe;
uniform vec3 uWipeColor;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 spectral(float t) {
  return vec3(exp(-pow(t / 0.34, 2.0)), exp(-pow((t - 0.5) / 0.3, 2.0)), exp(-pow((t - 1.0) / 0.34, 2.0)));
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uViewport.x / uViewport.y, 1.0);

  // Click pulse: a crest with a trough behind it, travelling outward.
  if (uPulse.w > 0.0) {
    vec2 d = (uv - uPulse.xy) * aspect;
    float dist = length(d);
    float radius = (1.0 - pow(1.0 - uPulse.z, 3.0)) * 0.42;
    float x = (dist - radius) / (0.012 + 0.04 * uPulse.z);
    float crest = exp(-x * x) - 0.45 * exp(-pow(x + 1.6, 2.0));
    uv -= normalize(d + 1e-5) / aspect * crest * 0.012 * uPulse.w;
  }

  vec2 c = uv - 0.5;
  vec2 ca = c * aspect;
  float r2 = dot(ca, ca);
  vec2 base = 0.5 + c * (1.0 + uBarrel * r2);
  vec2 spread = c * r2 * r2 * uDispersion;
  float blur = uBlur / uViewport.y;

  // Coarse enough to join the taps into one streak, no coarser: a coarser mip blurs every way, not just along the scroll.
  float gap = max(abs(uBlur) * uPixelRatio, length(spread * uViewport) * uPixelRatio) / float(${TAPS});
  float lod = log2(max(1.0, gap * 0.8));
  float jitter = hash(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0);

  vec3 sum = vec3(0.0);
  vec3 weight = vec3(0.0);
  for (int i = 0; i < ${TAPS}; i++) {
    float t = (float(i) + 0.5) / float(${TAPS});
    vec2 tap = base + spread * t;
    tap.y += blur * (fract(float(i) * 0.618034 + jitter) - 0.5);
    vec3 w = spectral(t);
    sum += textureLod(uScene, clamp(tap, 0.001, 0.999), lod).rgb * w;
    weight += w;
  }
  vec3 colour = sum / weight;

  colour *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2);
  colour += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;

  // The wipe: progress x of the front across the screen (from the right when w > 0, from the
  // left otherwise), softness y, opacity z.
  if (uWipe.z > 0.0) {
    float across = uWipe.w > 0.0 ? 1.0 - vUv.x : vUv.x;
    float front = uWipe.x * (1.0 + uWipe.y) - uWipe.y;
    float cover = smoothstep(front + uWipe.y, front, across);
    colour = mix(colour, uWipeColor, cover * uWipe.z);
  }
  gl_FragColor = vec4(colour, 1.0);
}
`;

export class CompositePass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      samples: 4,
      depthBuffer: true,
      // Mips for the smear's coarse taps. Allocated with the target (immutable storage
      // can't grow a mip chain later); at rest every tap reads level 0 anyway.
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.target.texture },
        uViewport: { value: new THREE.Vector2(2, 2) },
        uPixelRatio: { value: 1 },
        uBarrel: { value: 0 },
        uDispersion: { value: 0 },
        uBlur: { value: 0 },
        uGrain: { value: 0 },
        uVignette: { value: 0 },
        uTime: { value: 0 },
        uPulse: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
        uWipe: { value: new THREE.Vector4(0, 0.35, 0, 1) },
        uWipeColor: { value: new THREE.Color() },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.target.setSize(Math.max(2, Math.round(width * pixelRatio)), Math.max(2, Math.round(height * pixelRatio)));
    this.material.uniforms.uViewport.value.set(width, height);
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
