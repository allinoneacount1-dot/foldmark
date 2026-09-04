/**
 * The map's drawing grammar.
 *
 * Shared by the measured topology and the architecture preview so the two read
 * as one instrument: same shapes, same curves, same plotting surface. Only the
 * grammar is shared — the preview keeps its own geometry and its own rule that
 * nothing it draws is ever denominated, which is what the preview-isolation
 * test exists to hold.
 *
 * Everything here is pure drawing. No module in this file knows what a node
 * means, only how a class of node is shaped.
 */

export const PALETTE = {
  void: "#080A08",
  grid: "rgba(242,240,232,0.028)",
  gridAnchor: "rgba(242,240,232,0.07)",
  ink: "#F2F0E8",
  inkMuted: "#A8ADA4",
  inkFaint: "#5C6259",
  signal: "#C7FF4A",
  edge: "rgba(226,222,208,0.30)",
} as const;

/**
 * Semantic colour. Each class owns one hue everywhere it appears — canvas,
 * legend, inspector. Lime is reserved for emphasis (selection, active path, the
 * measured centre) and is never spent on ordinary structure.
 */
export const CLASS_COLOR = {
  asset: "#C7FF4A",
  venue: "#5AB4F0",
  protocol: "#A98BF5",
  oracle: "#E08898",
  infrastructure: "#8FA8D8",
  address: "#E8C766",
} as const;

export type DrawClass = keyof typeof CLASS_COLOR;

/** Base radius per class in screen pixels, before observed activity and zoom. */
export const CLASS_RADIUS: Record<DrawClass, number> = {
  asset: 15,
  venue: 12,
  protocol: 12,
  oracle: 10,
  infrastructure: 10,
  address: 7,
};

export type Point = { x: number; y: number };

/**
 * The plotting surface: a coordinate grid locked to the pan offset, so the
 * graph moves across a fixed field rather than dragging the field with it.
 * Faint enough to read as paper, with a heavier mark every fifth line.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  offset: Point = { x: 0, y: 0 },
) {
  const step = 46;
  const originX = offset.x % (step * 5);
  const originY = offset.y % (step * 5);

  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  for (let i = -5; i * step + originX < size.w + step * 5; i += 1) {
    const x = Math.round(i * step + originX) + 0.5;
    if (x < -step || x > size.w + step) continue;
    ctx.strokeStyle = i % 5 === 0 ? PALETTE.gridAnchor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.h);
    ctx.stroke();
  }
  for (let j = -5; j * step + originY < size.h + step * 5; j += 1) {
    const y = Math.round(j * step + originY) + 0.5;
    if (y < -step || y > size.h + step) continue;
    ctx.strokeStyle = j % 5 === 0 ? PALETTE.gridAnchor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
    ctx.stroke();
  }
}

/**
 * The shape a class is drawn in.
 *
 * Shape is the primary carrier of class and colour only reinforces it, so the
 * map stays readable to someone who cannot separate lime from violet.
 */
export function tracePath(ctx: CanvasRenderingContext2D, cls: DrawClass, p: Point, r: number) {
  ctx.beginPath();
  switch (cls) {
    case "asset":
    case "protocol": {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i;
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      return;
    }
    case "address": {
      const s = r * 0.86;
      ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
      return;
    }
    case "oracle": {
      const h = r * 1.16;
      ctx.moveTo(p.x, p.y - h);
      ctx.lineTo(p.x + h * 0.92, p.y + h * 0.72);
      ctx.lineTo(p.x - h * 0.92, p.y + h * 0.72);
      ctx.closePath();
      return;
    }
    case "infrastructure": {
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      return;
    }
    default:
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
}

/** A restrained halo. Depth on a near-black ground, not a glow effect. */
export function drawHalo(ctx: CanvasRenderingContext2D, p: Point, r: number, color: string, strength: number) {
  const halo = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.6);
  halo.addColorStop(0, withAlpha(color, strength));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
}

export type Curve = { ax: number; ay: number; cx: number; cy: number; bx: number; by: number };

/**
 * A shallow arc between two points.
 *
 * The bow is perpendicular to the run, and which side it falls on comes from a
 * hash of the edge id — so the two directions of a relationship separate into
 * distinct lanes instead of overdrawing each other, identically on every render
 * because the hash is of the id rather than of anything positional.
 */
export function arc(a: Point, b: Point, id: string): Curve {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const side = hash(id) % 2 === 0 ? 1 : -1;
  const bow = Math.min(58, len * 0.15) * side;
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    cx: (a.x + b.x) / 2 + (-dy / len) * bow,
    cy: (a.y + b.y) / 2 + (dx / len) * bow,
  };
}

export function pointAt(c: Curve, t: number): Point {
  const inv = 1 - t;
  return {
    x: inv * inv * c.ax + 2 * inv * t * c.cx + t * t * c.bx,
    y: inv * inv * c.ay + 2 * inv * t * c.cy + t * t * c.by,
  };
}

/** The parameter at which the curve is `d` pixels from one of its endpoints. */
export function tForRadius(c: Curve, d: number, fromStart: boolean): number {
  const ex = fromStart ? c.ax : c.bx;
  const ey = fromStart ? c.ay : c.by;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    const p = pointAt(c, fromStart ? mid : 1 - mid);
    if (Math.hypot(p.x - ex, p.y - ey) < d) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return fromStart ? Math.min(t, 0.48) : Math.max(1 - t, 0.52);
}

/** Direction, stated. The map's whole job is to say which way value went. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  alpha: number,
  size: number,
) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = 0.42;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(a - spread) * size, to.y - Math.sin(a - spread) * size);
  ctx.lineTo(to.x - Math.cos(a + spread) * size, to.y - Math.sin(a + spread) * size);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Sampled, which is accurate enough for a 7px hit radius and far cheaper. */
export function distanceToCurve(px: number, py: number, c: Curve): number {
  let best = Infinity;
  for (let i = 0; i <= 16; i += 1) {
    const p = pointAt(c, i / 16);
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < best) best = d;
  }
  return best;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** #RRGGBB to rgba(). The palette is authored as hex; the canvas needs alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
