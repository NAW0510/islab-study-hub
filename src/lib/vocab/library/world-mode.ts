/**
 * Whether the Perpustakaan gets its WebGL world ("gl") or stays the plain
 * DOM page ("dom"), decided once per visit. Software renderers draw WebGL on
 * the CPU and would make the page crawl, so they get the DOM page too.
 */
export type WorldMode = "gl" | "dom";

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

export function isSoftwareRenderer(renderer: string | null): boolean {
  return renderer !== null && SOFTWARE.test(renderer);
}

export function decideWorldMode(input: {
  reducedMotion: boolean;
  noWorld: boolean;
  hasWebGL2: boolean;
  renderer: string | null;
}): WorldMode {
  if (input.reducedMotion || input.noWorld || !input.hasWebGL2) return "dom";
  return isSoftwareRenderer(input.renderer) ? "dom" : "gl";
}

/** Browser only: a throwaway WebGL2 context that refuses a major performance caveat, and its renderer name. */
export function probeWebGL2(): { hasWebGL2: boolean; renderer: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return { hasWebGL2: false, renderer: null };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { hasWebGL2: true, renderer };
  } catch {
    return { hasWebGL2: false, renderer: null };
  }
}
