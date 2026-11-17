import * as THREE from "three";

/**
 * The screen pass: the scene, rendered to a target, drawn to the canvas
 * through a lens. Barrel distortion with a spectral split that grows with
 * the fourth power of the distance from the centre (sharp where text is
 * read, split at the corners), a vertical smear as long as the scroll is fast (sampled along y,
 * so it never smears into rainbows), a vignette, film grain, and click
 * pulses that ripple outward. All in display sRGB: no colour conversion.
 */
const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uBarrel;
uniform float uSplit;
uniform float uBlur;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
uniform vec4 uPulse;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 lens(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  c.x *= uResolution.x / uResolution.y;
  float r2 = dot(c, c);
  vec2 d = (uv - 0.5) * (1.0 + k * r2);
  return 0.5 + d;
}

void main() {
  vec2 uv = vUv;

  // Click pulse: a ring travelling outward from the click, bending what it passes.
  if (uPulse.w > 0.0) {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 d = (uv - uPulse.xy) * aspect;
    float dist = length(d);
    float radius = uPulse.z * 0.9;
    float ring = exp(-pow((dist - radius) * 18.0, 2.0));
    uv -= normalize(d + 1e-5) / aspect * ring * 0.012 * uPulse.w;
  }

  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(uResolution.x / uResolution.y, 1.0), c * vec2(uResolution.x / uResolution.y, 1.0));
  vec2 dir = normalize(c + 1e-5);
  // Grows with r⁴, so the middle of the screen (where the text is read) stays sharp and the corners split.
  vec2 split = dir * uSplit * r2 * r2 / uResolution;

  vec3 colour = vec3(0.0);
  const int SAMPLES = 7;
  for (int i = 0; i < SAMPLES; i++) {
    float o = (float(i) / float(SAMPLES - 1) - 0.5) * uBlur;
    vec2 base = uv + vec2(0.0, o);
    colour.r += texture2D(uScene, clamp(lens(base, uBarrel * 1.02) + split, 0.001, 0.999)).r;
    colour.g += texture2D(uScene, clamp(lens(base, uBarrel), 0.001, 0.999)).g;
    colour.b += texture2D(uScene, clamp(lens(base, uBarrel * 0.98) - split, 0.001, 0.999)).b;
  }
  colour /= float(SAMPLES);

  colour *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2);
  colour += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;
  gl_FragColor = vec4(colour, 1.0);
}
`;

export class CompositePass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(2, 2, { samples: 4, depthBuffer: true });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.target.texture },
        uResolution: { value: new THREE.Vector2(2, 2) },
        uBarrel: { value: 0 },
        uSplit: { value: 0 },
        uBlur: { value: 0 },
        uGrain: { value: 0 },
        uVignette: { value: 0 },
        uTime: { value: 0 },
        uPulse: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    const w = Math.max(2, Math.round(width * pixelRatio));
    const h = Math.max(2, Math.round(height * pixelRatio));
    this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
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
