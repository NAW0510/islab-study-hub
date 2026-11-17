/**
 * The sheet shader. Every displacement keys on where a vertex rests on
 * screen (CSS px, y down), the same maths as src/lib/vocab/library/fold.ts:
 *
 *   swell  a slow diagonal wave lifting a crest toward the camera;
 *   fold   above the fold line (just under the head) the river folds away,
 *          pushed back up to uFoldDepth, twisting and wobbling;
 *   flip   the sheet turns about its vertical axis to the definition;
 *   hover  lift, a lean toward the pointer, a press squash.
 *
 * World space: 1 unit = 1 CSS px on the card plane (z = 0), x right, y up,
 * +z toward the camera; the canvas centre is the origin.
 */
export const CARD_VERTEX = /* glsl */ `
uniform vec4 uRect;
uniform vec2 uView;
uniform float uFoldLine;
uniform float uFoldZone;
uniform float uFoldDepth;
uniform float uTwist;
uniform float uWobble;
uniform float uSwell;
uniform float uSwellWave;
uniform float uSwellPeriod;
uniform float uTime;
uniform float uSeed;
uniform float uFlip;
uniform float uHover;
uniform float uPress;
uniform vec2 uLean;
uniform float uRise;

varying vec2 vUv;
varying float vDepth;
varying float vShade;

const float PI = 3.141592653589793;

void main() {
  vUv = uv;
  vec2 local = vec2(uv.x - 0.5, 0.5 - uv.y) * uRect.zw;
  vec2 centre = uRect.xy + 0.5 * uRect.zw;
  vec2 screen = centre + local;

  float above = uFoldLine - screen.y;
  float t = clamp(above / uFoldZone, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  // Flip about the vertical axis, with a little lift so the turning edge clears the river.
  float a = uFlip * PI;
  float squash = 1.0 - 0.035 * uPress;
  vec3 p = vec3(local.x * cos(a) * squash, local.y * squash, local.x * sin(a));
  p.z += sin(uFlip * PI) * 0.18 * uRect.z;

  // Hover: lift and lean toward the pointer.
  p.z += uHover * (22.0 + dot(local / max(uRect.zw, vec2(1.0)), uLean) * 36.0);

  // Swell.
  float phase = (screen.x + screen.y) / uSwellWave * 2.0 * PI - uTime / uSwellPeriod * 2.0 * PI;
  p.z += uSwell * 0.5 * (1.0 + sin(phase));

  // Fold: back, twisting about the sheet's vertical axis, wobbling with its own seed.
  float depth = uFoldDepth * t * t;
  float twist = t * (uTwist * (uSeed > 0.5 ? 1.0 : -1.0) + uWobble * sin(uTime * 1.3 + uSeed * 6.2831));
  float c = cos(twist);
  float s = sin(twist);
  p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
  p.z -= depth;

  // Entrance: sheets rise out of the fog row by row.
  p.z -= (1.0 - uRise) * 900.0;
  p.y += (1.0 - uRise) * 60.0;

  vDepth = -p.z;
  vShade = 1.0 - 0.22 * abs(sin(a)) - 0.12 * t;
  vec3 world = vec3(centre.x - 0.5 * uView.x + p.x, 0.5 * uView.y - centre.y - p.y, p.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

export const CARD_FRAGMENT = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec3 uFog;
uniform float uFogDepth;
uniform float uCoverFraction;
uniform float uHover;
uniform float uRise;

varying vec2 vUv;
varying float vDepth;
varying float vShade;

void main() {
  vec2 uv = vUv;
  vec4 colour;
  if (gl_FrontFacing) {
    // The cover zooms a little under hover; the strip stays.
    float coverTop = 1.0 - uCoverFraction;
    if (uv.y > coverTop) {
      vec2 centre = vec2(0.5, coverTop + 0.5 * uCoverFraction);
      uv = centre + (uv - centre) / (1.0 + 0.05 * uHover);
    }
    colour = texture2D(uFront, uv);
  } else {
    colour = texture2D(uBack, vec2(1.0 - uv.x, uv.y));
  }
  if (colour.a < 0.02) discard;
  float fog = clamp(vDepth / uFogDepth, 0.0, 1.0);
  vec3 rgb = mix(colour.rgb * vShade, uFog, fog * 0.92);
  float alpha = colour.a * (1.0 - smoothstep(0.82, 1.0, fog)) * smoothstep(0.0, 0.35, uRise);
  gl_FragColor = vec4(rgb, alpha);
}
`;
