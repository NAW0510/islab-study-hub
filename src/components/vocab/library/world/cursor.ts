import { LIBRARY_CONFIG } from "@/lib/vocab/library/config";
import type { LayerFrame, WorldLayer } from "./engine";

/**
 * The cursor ring (fine pointers only; the native cursor stays): a thin ring
 * that lags behind the pointer and stretches along its motion, grows into a
 * halo over a sheet, tightens over other controls and presses in on a click.
 * A DOM element moved with transforms only, above the page and never in the
 * way of a click (pointer-events: none).
 */
const { LAG, STRETCH } = LIBRARY_CONFIG.cursor;

export class CursorRing implements WorldLayer {
  private readonly ring: HTMLDivElement;
  private x = -100;
  private y = -100;
  private targetX = -100;
  private targetY = -100;
  private vx = 0;
  private vy = 0;
  private scale = 1;
  private shown = false;
  private mode: "free" | "card" | "control" = "free";
  private pressed = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(host: HTMLElement) {
    this.ring = document.createElement("div");
    this.ring.className = "library-cursor";
    this.ring.setAttribute("aria-hidden", "true");
    host.appendChild(this.ring);
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn, { passive: true });
      this.cleanups.push(() => window.removeEventListener(type, fn));
    };
    on("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      this.targetX = e.clientX;
      this.targetY = e.clientY;
      if (!this.shown) {
        this.x = e.clientX;
        this.y = e.clientY;
        this.shown = true;
      }
      const el = e.target as HTMLElement | null;
      this.mode = el?.closest?.("[data-library-card] .library-sheet") ? "card" : el?.closest?.("a, button, input, select, [role='button']") ? "control" : "free";
    });
    on("pointerdown", () => {
      this.pressed = 1;
    });
    const leave = () => {
      this.shown = false;
    };
    document.documentElement.addEventListener("pointerleave", leave);
    this.cleanups.push(() => document.documentElement.removeEventListener("pointerleave", leave));
  }

  update(frame: LayerFrame) {
    const k = 1 - Math.exp(-frame.dt / LAG);
    const px = this.x;
    const py = this.y;
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    const dt = Math.max(frame.dt, 1e-3);
    this.vx += ((this.x - px) / dt - this.vx) * 0.3;
    this.vy += ((this.y - py) / dt - this.vy) * 0.3;
    const speed = Math.hypot(this.vx, this.vy);
    const stretch = 1 + Math.min(STRETCH, speed / 2400);
    const angle = Math.atan2(this.vy, this.vx);
    const want = this.mode === "card" ? 2.3 : this.mode === "control" ? 0.7 : 1;
    this.scale += (want - this.scale) * (1 - Math.exp(-frame.dt / 0.14));
    this.pressed += (0 - this.pressed) * (1 - Math.exp(-frame.dt / 0.12));
    const s = this.scale * (1 - 0.22 * this.pressed);
    this.ring.style.opacity = this.shown ? "1" : "0";
    this.ring.dataset.mode = this.mode;
    this.ring.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(${angle}rad) scale(${s * stretch}, ${s / Math.sqrt(stretch)})`;
  }

  dispose() {
    for (const fn of this.cleanups) fn();
    this.ring.remove();
  }
}
