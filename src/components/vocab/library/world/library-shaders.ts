/**
 * Shaders shared by the library's parts. Everything stays in display sRGB
 * (raw colours in, raw colours out). Colours come in pairs, a day and a
 * night value, mixed by uDark, so a scheme change can glide.
 *
 * Light, in order:
 *   ambient   high by day (a pale, evenly lit archive), low by night;
 *   key       a soft light from the high windows, above and in front;
 *   recess    the deeper into a wall, the darker (books between shelves);
 *   rim       at night, cold light on the edges that face across the nave;
 *   lanterns  pools of warm light around each lantern;
 * then a tint toward the field colour inside a field's room, then fog:
 *   height    thicker near the floor, thinner up in the vault;
 *   veil      never fully clear, so the stacks read as a dream behind the
 *             cards and never as clutter;
 *   scatter   the great window's light glowing in the fog around it, so far
 *             things turn into silhouettes against bright air.
 */
export const LIBRARY_UNIFORMS = /* glsl */ `
uniform float uDark;
uniform float uUnit;
uniform float uNave;
uniform float uCentreX;
uniform vec3 uFogDay;
uniform vec3 uFogNight;
uniform float uFogStart;
uniform float uFogDensity;
uniform float uTheme;
uniform vec3 uThemeColor;
uniform vec4 uWindowScreen;
uniform vec3 uScatterDay;
uniform vec3 uScatterNight;
uniform float uPixelRatio;
uniform vec4 uLanterns[12];
uniform vec3 uLanternDay;
uniform vec3 uLanternNight;
uniform float uDetail;
`;

export const LIBRARY_FUNCTIONS = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 themeTint(vec3 c) {
  if (uTheme <= 0.0) return c;
  // Keep the value, lean the hue: a room whose stone and paper carry a breath of the field's colour.
  vec3 hue = uThemeColor / max(luma(uThemeColor), 0.2);
  vec3 tinted = clamp(luma(c) * hue, 0.0, 1.0);
  return mix(c, tinted, uTheme * 0.26);
}

vec3 fogColour() {
  vec3 fog = mix(uFogDay, uFogNight, uDark);
  if (uTheme > 0.0) {
    vec3 themed = mix(mix(fog, uThemeColor, 0.09), mix(fog, uThemeColor * 0.22, 0.5), uDark);
    fog = mix(fog, themed, uTheme);
  }
  return fog;
}

vec3 windowScatter() {
  vec2 css = gl_FragCoord.xy / uPixelRatio;
  vec2 d = (css - uWindowScreen.xy) / max(uWindowScreen.z, 1.0);
  d.y *= 0.6;
  float r2 = dot(d, d);
  float g = exp(-r2 * 0.6) * 0.7 + exp(-r2 * 0.08) * 0.3;
  return mix(uScatterDay, uScatterNight, uDark) * g;
}

float fogAmount(float depth, float worldY, float reach) {
  float h = clamp((worldY / uUnit + 9.0) / 28.0, 0.0, 1.0);
  // On a term's page the library sinks into a much thicker fog, so its text always sits on something close to the page colour.
  float density = uFogDensity * mix(1.4, 0.7, h) * (1.0 + 1.8 * uDetail);
  float beyond = max(depth - uFogStart * (1.0 - 0.5 * uDetail), 0.0) / reach;
  float f = 1.0 - exp(-pow(beyond * density, 1.55));
  return max(f, mix(mix(0.22, 0.08, uDark), mix(0.62, 0.5, uDark), uDetail));
}

vec3 applyFog(vec3 c, float depth, float worldY, float reach) {
  return mix(c, fogColour() + windowScatter(), clamp(fogAmount(depth, worldY, reach), 0.0, 1.0));
}

vec3 lanternPools(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 l = uLanterns[i];
    if (l.w <= 0.0) continue;
    vec3 to = l.xyz - p;
    float d = length(to) / (3.2 * uUnit);
    float face = 0.35 + 0.65 * max(dot(n, to / max(length(to), 1.0)), 0.0);
    sum += vec3(l.w * face / (1.0 + d * d * 2.2));
  }
  return sum * mix(uLanternDay, uLanternNight, uDark);
}
`;

/** Solid parts (stone, wood, book cloth), instanced, with a day and a night colour per instance. */
export const SOLID_VERTEX = /* glsl */ `
attribute vec3 aDay;
attribute vec3 aNight;
varying vec3 vDay;
varying vec3 vNight;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vDay = aDay;
  vNight = aNight;
  vec4 local = instanceMatrix * vec4(position, 1.0);
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

export const SOLID_FRAGMENT = /* glsl */ `
${LIBRARY_UNIFORMS}
${LIBRARY_FUNCTIONS}
uniform float uReach;
varying vec3 vDay;
varying vec3 vNight;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;
const vec3 KEY = vec3(-0.38, 0.84, 0.39);
void main() {
  vec3 n = normalize(vNormal);
  vec3 base = themeTint(mix(vDay, vNight, uDark));
  float sky = 0.5 + 0.5 * n.y;
  float ambient = mix(0.76 + 0.12 * sky, 0.3 + 0.12 * sky, uDark);
  float key = max(dot(n, KEY), 0.0) * mix(0.22, 0.34, uDark);
  vec3 c = base * (ambient + key);
  float inWall = abs(vWorld.x - uCentreX) - uNave;
  c *= 1.0 - smoothstep(-0.1 * uUnit, 1.3 * uUnit, inWall) * mix(0.24, 0.48, uDark);
  float rim = pow(1.0 - abs(n.z), 3.0) * uDark;
  c += vec3(0.22, 0.36, 0.7) * rim * 0.14;
  c += base * lanternPools(vWorld, n) * mix(0.8, 1.7, uDark);
  gl_FragColor = vec4(applyFog(c, vDepth, vWorld.y, uReach), 1.0);
}
`;

/** Flat parts drawn with a single colour pair (floor), plain mesh. */
export const FLAT_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

export const FLOOR_FRAGMENT = /* glsl */ `
${LIBRARY_UNIFORMS}
${LIBRARY_FUNCTIONS}
uniform vec3 uDay;
uniform vec3 uNight;
uniform vec3 uRiverDay;
uniform vec3 uRiverNight;
varying vec3 vWorld;
varying float vDepth;
varying vec2 vUv;
void main() {
  vec3 base = themeTint(mix(uDay, uNight, uDark));
  // Flagstones: faint joints every two units.
  vec2 cell = abs(fract(vec2(vWorld.x - uCentreX, vWorld.z) / (2.0 * uUnit)) - 0.5);
  float joint = smoothstep(0.47, 0.5, max(cell.x, cell.y));
  vec3 c = base * mix(0.92, 0.42, uDark) * (1.0 - joint * mix(0.08, 0.25, uDark));
  // The river of light down the middle of the nave.
  float across = abs(vWorld.x - uCentreX) / max(uNave, 1.0);
  float river = exp(-across * across * 9.0);
  c += mix(uRiverDay, uRiverNight, uDark) * river * mix(0.35, 0.55, uDark);
  c += base * lanternPools(vWorld, vec3(0.0, 1.0, 0.0)) * mix(0.6, 1.4, uDark);
  gl_FragColor = vec4(applyFog(c, vDepth, vWorld.y, 1.0), 1.0);
}
`;

/**
 * The great window: a pointed arch with three lancets under a rose and
 * leaded quarries. Day: a white-gold blaze, brightest high up. Night: deep
 * blue glass, a few stars and a moon in the rose. Light carries through fog
 * that swallows stone, so the glass is fogged far less (reach).
 */
export const WINDOW_FRAGMENT = /* glsl */ `
${LIBRARY_UNIFORMS}
${LIBRARY_FUNCTIONS}
uniform vec3 uGlassDay;
uniform vec3 uGlassNight;
uniform vec3 uLead;
uniform float uTime;
varying vec3 vWorld;
varying float vDepth;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// Inside an equilateral pointed arch of half width a springing at height s.
float arch(vec2 p, float a, float s) {
  if (abs(p.x) > a) return 0.0;
  if (p.y < s) return 1.0;
  float l = length(p - vec2(-a, s));
  float r = length(p - vec2(a, s));
  return step(l, 2.0 * a) * step(r, 2.0 * a);
}

void main() {
  // p: x in [-1, 1] across the window, y from 0 at the sill to about 3.3 at the apex.
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y * 3.3);
  float outer = arch(p, 1.0, 1.6);
  if (outer < 0.5) discard;
  float inner = arch(p, 0.92, 1.62);
  float glass = 0.0;
  // Three lancets.
  for (int i = -1; i <= 1; i++) {
    glass = max(glass, arch(vec2(p.x - float(i) * 0.6, p.y - 0.06), 0.24, 1.35));
  }
  // The rose.
  vec2 rose = p - vec2(0.0, 2.35);
  float rr = length(rose);
  float roseGlass = step(rr, 0.48) * (1.0 - step(0.42, rr) * step(rr, 0.46));
  float petals = step(0.12, rr) * step(0.04, abs(sin(atan(rose.y, rose.x) * 4.0)) * rr);
  glass = max(glass, roseGlass * petals);
  glass *= inner;
  // Leaded quarries.
  vec2 q = abs(fract(vec2(p.x + p.y, p.x - p.y) * 5.0) - 0.5);
  float lead = smoothstep(0.44, 0.5, max(q.x, q.y));
  float high = smoothstep(0.0, 3.0, p.y);
  vec3 day = uGlassDay * (0.86 + 0.24 * high);
  vec3 night = uGlassNight * (0.55 + 0.6 * high);
  float star = step(0.996, hash(floor(p * 60.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(floor(p * 60.0)) * 30.0));
  night += vec3(0.8, 0.85, 1.0) * star * 0.6;
  float moon = smoothstep(0.2, 0.17, length(rose - vec2(0.08, 0.04)));
  night = mix(night, vec3(0.92, 0.95, 1.0), moon);
  vec3 lit = mix(day, night, uDark);
  vec3 c = mix(uLead * mix(1.0, 0.4, uDark), lit * (1.0 - lead * 0.35), glass);
  gl_FragColor = vec4(applyFog(c, vDepth, vWorld.y, 6.0), 1.0);
}
`;

/** Soft additive / screen light: god rays, the halo, the river glow. A radial or linear falloff from uv. */
export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
uniform float uShape;
varying vec2 vUv;
void main() {
  float a;
  if (uShape < 0.5) {
    // A beam: bright at the window end (v = 1), fading toward the visitor, soft at its sides.
    float side = 1.0 - abs(vUv.x * 2.0 - 1.0);
    a = pow(vUv.y, 1.6) * smoothstep(0.0, 0.8, side);
  } else {
    float r = length(vUv - 0.5) * 2.0;
    a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.85, 1.0, r));
  }
  gl_FragColor = vec4(uColour * a * uOpacity, 1.0);
}
`;

/** Sheets of mist: soft wisps, coloured like the fog. */
export const MIST_FRAGMENT = /* glsl */ `
${LIBRARY_UNIFORMS}
${LIBRARY_FUNCTIONS}
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uDrift;
varying vec3 vWorld;
varying float vDepth;
varying vec2 vUv;
void main() {
  float wisp = texture2D(uMap, vec2(vUv.x * 1.5 + uDrift, vUv.y)).a;
  float edge = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  gl_FragColor = vec4(fogColour() + windowScatter() * 0.6, wisp * edge * uOpacity);
}
`;
