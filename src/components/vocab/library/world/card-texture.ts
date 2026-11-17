import { COVER_COLS, COVER_ROWS, coverPattern, TILE_PATHS } from "@/lib/vocab/library/cover-pattern";
import type { UiColors } from "./palette";

/**
 * Draws a card's two faces into canvases the world uploads as textures. The
 * layout mirrors the DOM card (.library-* in globals.css): a 5:2 cover of
 * Bauhaus tiles on paper, then the strip with the term, its field and Week
 * and an arrow; the back is the definition on ink. Sizes are CSS px times
 * `scale`.
 */
export type CardFaceData = { id: string; term: string; meta: string; definition: string; main: string; deep: string };
export type CardFonts = { display: string; body: string };

const RADIUS = 14; // --r-card
const PATHS = new Map<string, Path2D>();
const path = (kind: keyof typeof TILE_PATHS) => {
  let p = PATHS.get(kind);
  if (!p) {
    p = new Path2D(TILE_PATHS[kind]);
    PATHS.set(kind, p);
  }
  return p;
};

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  return [canvas, ctx];
}

function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
}

/** Text cut to the width with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** Word-wrapped lines, the last one ellipsed when the text runs out of lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines - 1) {
      lines.push(fit(ctx, [line, ...words.slice(i + 1)].join(" "), width));
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export function drawFront(data: CardFaceData, colors: UiColors, fonts: CardFonts, width: number, height: number, scale: number) {
  const [canvas, ctx] = canvasOf(width * scale, height * scale);
  ctx.scale(scale, scale);
  roundedRect(ctx, width, height, RADIUS);
  ctx.save();
  ctx.clip();

  // Strip background, then the cover over its top 5:2.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, width, height);
  const coverH = Math.min(height, width * 0.4);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, coverH);
  const tile = Math.max(width / COVER_COLS, coverH / COVER_ROWS); // "slice": fill, crop the overflow
  const offsetX = (width - tile * COVER_COLS) / 2;
  const offsetY = (coverH - tile * COVER_ROWS) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, coverH);
  ctx.clip();
  for (const t of coverPattern(data.id)) {
    ctx.save();
    ctx.translate(offsetX + t.col * tile, offsetY + t.row * tile);
    ctx.scale(tile / 100, tile / 100);
    ctx.translate(50, 50);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.translate(-50, -50);
    ctx.fillStyle = t.ink === "main" ? data.main : data.deep;
    ctx.fill(path(t.kind), "evenodd");
    ctx.restore();
  }
  ctx.restore();

  // Strip: the term, its field and Week, the arrow.
  const pad = 16;
  const arrow = 17.6;
  const textWidth = width - pad * 2 - arrow - 12;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.text;
  ctx.font = `600 18.4px ${fonts.display}`;
  ctx.letterSpacing = "-0.37px";
  ctx.fillText(fit(ctx, data.term, textWidth), pad, coverH + 13.6 + 18.4);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = colors.muted;
  ctx.font = `400 12.8px ${fonts.body}`;
  ctx.fillText(fit(ctx, data.meta, textWidth), pad, coverH + 13.6 + 23 + 17);

  const ax = width - pad - arrow;
  const ay = coverH + (height - coverH) / 2 - arrow / 2;
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ax + arrow * 0.29, ay + arrow * 0.29);
  ctx.lineTo(ax + arrow * 0.71, ay + arrow * 0.71);
  ctx.moveTo(ax + arrow * 0.71, ay + arrow * 0.29);
  ctx.lineTo(ax + arrow * 0.71, ay + arrow * 0.71);
  ctx.lineTo(ax + arrow * 0.29, ay + arrow * 0.71);
  ctx.stroke();
  ctx.restore();

  // Hairline edge.
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, width - 1, height - 1, RADIUS);
  ctx.stroke();
  return { canvas, coverFraction: coverH / height };
}

export function drawBack(data: CardFaceData, colors: UiColors, fonts: CardFonts, width: number, height: number, scale: number) {
  const [canvas, ctx] = canvasOf(width * scale, height * scale);
  ctx.scale(scale, scale);
  roundedRect(ctx, width, height, RADIUS);
  ctx.fillStyle = colors.primary;
  ctx.fill();

  const pad = 20;
  ctx.fillStyle = colors.primaryFg;
  ctx.globalAlpha = 0.75;
  ctx.font = `600 11px ${fonts.body}`;
  ctx.letterSpacing = "1.5px";
  ctx.fillText(fit(ctx, `DEFINISI · ${data.term.toUpperCase()}`, width - pad * 2), pad, pad + 11);
  ctx.letterSpacing = "0px";
  ctx.globalAlpha = 1;

  ctx.font = `400 15.2px ${fonts.body}`;
  const lineHeight = 24.3;
  const top = pad + 11 + 12 + 15.2;
  const maxLines = Math.max(1, Math.floor((height - top - pad + lineHeight - 15.2) / lineHeight));
  const lines = wrap(ctx, data.definition || "Belum ada definisi.", width - pad * 2, maxLines);
  lines.forEach((line, i) => ctx.fillText(line, pad, top + i * lineHeight));
  return { canvas };
}
