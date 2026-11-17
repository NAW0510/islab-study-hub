import * as THREE from "three";
import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import type { QualityLevel } from "@/lib/vocab/library/quality";
import type { LayerFrame, WorldLayer } from "./engine";
import type { Scheme } from "./palette";

/**
 * Small things in the air, in front of the river:
 *   motes   a trail behind a moving mouse, drifting up and fading;
 *   paper   resting the mouse a moment releases a swarm of little pages that
 *           flutter out and fall away into the fog;
 *   dust    a slow drift of specks across the nave.
 * Mouse-only (touch gets none); all of it thins with the quality tier.
 */
const MOTES = 160;
const PAPERS = 40;
const DUST = 260;
const REST_MS = LIBRARY_CONFIG.cursor.REST_MS;

const POINT_VERTEX = /* glsl */ `
attribute float aLife;
attribute float aSize;
uniform float uScale;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale * (2000.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vLife * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

type Paper = { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number };

export class Particles implements WorldLayer {
  private readonly motes: THREE.Points;
  private readonly moteData = { pos: new Float32Array(MOTES * 3), vel: new Float32Array(MOTES * 3), life: new Float32Array(MOTES), size: new Float32Array(MOTES) };
  private moteCursor = 0;
  private readonly dust: THREE.Points;
  private readonly dustVel = new Float32Array(DUST * 3);
  private readonly papers: THREE.InstancedMesh;
  private readonly paperData: Paper[] = [];
  private lastPointer = new THREE.Vector2(9, 9);
  private restMs = 0;
  private swarmed = false;
  private density = 1;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(private readonly scene: THREE.Scene) {
    const material = (color: THREE.Color, opacity: number, scale: number, additive: boolean) =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uColor: { value: color }, uOpacity: { value: opacity }, uScale: { value: scale } },
      });

    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(this.moteData.pos, 3));
    moteGeo.setAttribute("aLife", new THREE.BufferAttribute(this.moteData.life, 1));
    moteGeo.setAttribute("aSize", new THREE.BufferAttribute(this.moteData.size, 1));
    this.motes = new THREE.Points(moteGeo, material(new THREE.Color(), 0.9, 1, true));
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    const dustPos = new Float32Array(DUST * 3);
    const dustLife = new Float32Array(DUST).fill(1);
    const dustSize = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dustPos.set([(Math.random() - 0.5) * 3200, (Math.random() - 0.5) * 1800, -200 - Math.random() * 4200], i * 3);
      this.dustVel.set([(Math.random() - 0.5) * 6, 4 + Math.random() * 8, 0], i * 3);
      dustSize[i] = 2 + Math.random() * 3.5;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    dustGeo.setAttribute("aLife", new THREE.BufferAttribute(dustLife, 1));
    dustGeo.setAttribute("aSize", new THREE.BufferAttribute(dustSize, 1));
    this.dust = new THREE.Points(dustGeo, material(new THREE.Color(), 0.45, 1, true));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    const paperGeo = new THREE.PlaneGeometry(22, 28);
    const paperMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    this.papers = new THREE.InstancedMesh(paperGeo, paperMat, PAPERS);
    this.papers.frustumCulled = false;
    this.papers.count = 0;
    scene.add(this.papers);
    this.setScheme("light");
  }

  setScheme(scheme: Scheme) {
    const motes = this.motes.material as THREE.ShaderMaterial;
    const dust = this.dust.material as THREE.ShaderMaterial;
    if (scheme === "dark") {
      motes.uniforms.uColor.value.setRGB(1, 0.82, 0.55);
      dust.uniforms.uColor.value.setRGB(0.7, 0.78, 1);
      (this.papers.material as THREE.MeshBasicMaterial).color.setRGB(0.86, 0.88, 0.95);
      motes.blending = THREE.AdditiveBlending;
      dust.blending = THREE.AdditiveBlending;
    } else {
      motes.uniforms.uColor.value.setRGB(0.55, 0.47, 0.32);
      dust.uniforms.uColor.value.setRGB(0.55, 0.5, 0.42);
      (this.papers.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.995, 0.97);
      motes.blending = THREE.NormalBlending;
      dust.blending = THREE.NormalBlending;
    }
    motes.needsUpdate = true;
    dust.needsUpdate = true;
  }

  setTier(tier: QualityLevel["tier"]) {
    this.density = tier === "high" ? 1 : tier === "medium" ? 0.6 : 0.3;
    this.dust.geometry.setDrawRange(0, Math.round(DUST * this.density));
  }

  /** Screen point (CSS px) → a world point just in front of the card plane. */
  private toWorld(frame: LayerFrame, out: THREE.Vector3) {
    const z = 120;
    const k = (LIBRARY_CONFIG.camera.DISTANCE - z) / LIBRARY_CONFIG.camera.DISTANCE;
    out.set((frame.pointer.x * frame.viewWidth) / 2 * k, (frame.pointer.y * frame.viewHeight) / 2 * k, z);
    return out;
  }

  update(frame: LayerFrame) {
    const dt = frame.dt;
    const at = this.toWorld(frame, new THREE.Vector3());
    const moved = frame.pointer.distanceTo(this.lastPointer) > 0.0015;
    this.lastPointer.copy(frame.pointer);

    // Motes behind a moving mouse.
    if (frame.pointerActive && moved && Math.random() < this.density) {
      const i = this.moteCursor;
      this.moteCursor = (this.moteCursor + 1) % MOTES;
      this.moteData.pos.set([at.x + (Math.random() - 0.5) * 10, at.y + (Math.random() - 0.5) * 10, at.z], i * 3);
      this.moteData.vel.set([(Math.random() - 0.5) * 30, 20 + Math.random() * 40, (Math.random() - 0.5) * 40], i * 3);
      this.moteData.life[i] = 1;
      this.moteData.size[i] = 3 + Math.random() * 4;
    }
    for (let i = 0; i < MOTES; i++) {
      if (this.moteData.life[i] <= 0) continue;
      this.moteData.life[i] = Math.max(0, this.moteData.life[i] - dt / 1.1);
      for (let a = 0; a < 3; a++) this.moteData.pos[i * 3 + a] += this.moteData.vel[i * 3 + a] * dt;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.geometry.attributes.aLife.needsUpdate = true;

    // Paper: resting the mouse a moment releases a swarm.
    this.restMs = moved || !frame.pointerActive ? 0 : this.restMs + dt * 1000;
    if (moved) this.swarmed = false;
    if (frame.pointerActive && !this.swarmed && this.restMs > REST_MS && frame.scrollSpeed < 50) {
      this.swarmed = true;
      const count = Math.round(20 * this.density) + 6;
      for (let n = 0; n < count && this.paperData.length < PAPERS; n++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 260;
        this.paperData.push({
          pos: at.clone(),
          vel: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed * 0.7 + 90, -60 - Math.random() * 220),
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4),
          life: 1,
        });
      }
    }
    for (const p of this.paperData) {
      p.life -= dt / 2.6;
      p.vel.multiplyScalar(Math.exp(-dt * 1.1));
      p.vel.y -= 60 * dt;
      p.vel.x += Math.sin(frame.time * 3 + p.rot.x) * 40 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
    }
    for (let i = this.paperData.length - 1; i >= 0; i--) if (this.paperData[i].life <= 0) this.paperData.splice(i, 1);
    this.paperData.forEach((p, i) => {
      this.quat.setFromEuler(p.rot);
      this.matrix.compose(p.pos, this.quat, this.one.setScalar(Math.min(1, p.life * 3)));
      this.papers.setMatrixAt(i, this.matrix);
    });
    this.papers.count = this.paperData.length;
    this.papers.instanceMatrix.needsUpdate = true;

    // Dust drifts up and wraps around.
    const pos = this.dust.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] += (this.dustVel[i * 3] + Math.sin(frame.time * 0.3 + i) * 3) * dt;
      pos[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      if (pos[i * 3 + 1] > 900) pos[i * 3 + 1] = -900;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    for (const obj of [this.motes, this.dust]) {
      this.scene.remove(obj);
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
    this.scene.remove(this.papers);
    this.papers.geometry.dispose();
    (this.papers.material as THREE.Material).dispose();
  }
}
