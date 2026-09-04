"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PALETTE,
  CLASS_COLOR,
  CLASS_RADIUS,
  drawGrid,
  drawHalo,
  tracePath,
  arc,
  pointAt,
  tForRadius,
  drawArrow,
  distanceToCurve,
  clamp,
  withAlpha,
  type DrawClass,
  type Point,
} from "@/components/graph/draw";
import { MOTION, easeOut, prefersReducedMotion } from "@/lib/motion";
import type { PreviewEdge, PreviewNode, PreviewNodeKind, PreviewTopology } from "@/lib/presentation-preview";

/**
 * The architecture preview canvas.
 *
 * THE RULE THIS FILE IS BUILT AROUND: it draws STRUCTURE and never a
 * MEASUREMENT. Every node is a category — ASSET, PROTOCOL, WALLET, MARKET,
 * LIQUIDITY — and nothing on screen is denominated: no amount, no count, no
 * percentage, no address, no symbol. Radius comes from a structural weight and
 * stroke from a structural intensity; neither is a quantity of anything, and
 * neither is ever printed as text.
 *
 * It shares the measured map's drawing grammar — same shapes, same curves, same
 * plotting surface — so a visitor learns the instrument they will later read
 * real data in. It shares none of its data, which is the line the
 * preview-isolation test holds.
 */

export type PreviewHit = { kind: "node"; node: PreviewNode } | { kind: "edge"; edge: PreviewEdge };

/** Preview categories map onto the same visual classes the measured map uses. */
const KIND_CLASS: Record<PreviewNodeKind, DrawClass> = {
  asset: "asset",
  market: "venue",
  protocol: "protocol",
  wallet: "address",
};

const RING: Record<DrawClass, number> = {
  asset: 0.34,
  venue: 0.66,
  protocol: 0.66,
  address: 0.98,
  oracle: 1.1,
  infrastructure: 1.1,
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3.5;
const FIT_PADDING = 58;

type Placed = PreviewNode & { cls: DrawClass; wx: number; wy: number; angle: number };
type View = { k: number; spread: number; tx: number; ty: number };

/**
 * Radial placement, deterministic and seed-free.
 *
 * Assets inner, venues and protocols around them, wallets on the rim — the same
 * role ordering the measured map uses, so the two read as one instrument. Outer
 * nodes are aimed at the inner node they connect to, which keeps edges short
 * and roughly radial instead of crossing the whole field.
 */
function layoutPreview(topology: PreviewTopology): Placed[] {
  const classOf = new Map(topology.nodes.map((n) => [n.id, KIND_CLASS[n.kind]]));
  const placed: Placed[] = [];
  const angleOf = new Map<string, number>();

  const put = (n: PreviewNode, angle: number, radius: number) => {
    const cls = classOf.get(n.id) ?? "address";
    angleOf.set(n.id, angle);
    placed.push({ ...n, cls, angle, wx: Math.cos(angle) * radius, wy: Math.sin(angle) * radius });
  };

  const assets = topology.nodes.filter((n) => classOf.get(n.id) === "asset");
  assets.forEach((n, i) => put(n, -Math.PI / 2 + (i / Math.max(1, assets.length)) * Math.PI * 2, RING.asset));

  for (const ring of [["venue", "protocol"], ["address"]] as DrawClass[][]) {
    const members = topology.nodes.filter((n) => ring.includes(classOf.get(n.id) ?? "address"));
    if (!members.length) continue;
    const aimed = members.map((n) => {
      let x = 0;
      let y = 0;
      for (const e of topology.edges) {
        const other = e.source === n.id ? e.target : e.target === n.id ? e.source : null;
        const a = other ? angleOf.get(other) : undefined;
        if (a === undefined) continue;
        x += Math.cos(a);
        y += Math.sin(a);
      }
      return { node: n, angle: x === 0 && y === 0 ? -Math.PI / 2 : Math.atan2(y, x) };
    });
    aimed.sort((p, q) => p.angle - q.angle || (p.node.id < q.node.id ? -1 : 1));
    const offset = aimed[0].angle;
    aimed.forEach((p, i) => put(p.node, offset + (i / aimed.length) * Math.PI * 2, RING[ring[0]]));
  }

  return placed;
}

export function PreviewCanvas({
  topology,
  selected,
  onSelect,
}: {
  topology: PreviewTopology;
  selected: PreviewHit | null;
  onSelect: (hit: PreviewHit | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<PreviewHit | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const nodes = useMemo(() => layoutPreview(topology), [topology]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback((): View | null => {
    if (size.w === 0 || size.h === 0 || !nodes.length) return null;
    const span = 2 * Math.max(...nodes.map((n) => Math.hypot(n.wx, n.wy)), 0.5);
    const usableW = Math.max(120, size.w - FIT_PADDING * 2);
    const usableH = Math.max(120, size.h - FIT_PADDING * 2);
    const k = clamp(Math.min(usableW / span, usableH / span), 1, 4000);
    /**
     * A wide canvas gets an elliptical field rather than a small circle
     * marooned in the middle of it. Only POSITIONS stretch horizontally —
     * node shapes keep their aspect, so a hexagon never becomes an ellipse.
     */
    const spread = clamp(usableW / span / k, 1, 1.7);
    return { k, spread, tx: size.w / 2, ty: size.h / 2 };
  }, [nodes, size.w, size.h]);

  /**
   * The view is derived, never synced.
   *
   * `fitted` is a pure function of the layout and the viewport. A pan or zoom
   * the reader performs is held beside the layout it belongs to, so it
   * survives a resize and is dropped the moment the map underneath it
   * changes. Deriving rather than storing keeps a render from scheduling
   * another render, and keeps the fitted scale readable during render
   * without reaching into a ref.
   */
  const fitted = useMemo(() => fitView(), [fitView]);
  const [manual, setManual] = useState<{ of: Placed[]; view: View } | null>(null);
  const view = manual && manual.of === nodes ? manual.view : fitted;
  const relativeZoom = view && fitted ? view.k / fitted.k : 1;

  const adjust = useCallback(
    (fn: (v: View) => View) => {
      setManual((m) => {
        const base = m && m.of === nodes ? m.view : fitted;
        return base ? { of: nodes, view: fn(base) } : m;
      });
    },
    [nodes, fitted],
  );

  const resetView = useCallback(() => setManual(null), []);

  const project = useCallback(
    (n: { wx: number; wy: number }) =>
      view ? { x: n.wx * view.k * view.spread + view.tx, y: n.wy * view.k + view.ty } : { x: 0, y: 0 },
    [view],
  );

  const radius = useCallback(
    (n: Placed) =>
      CLASS_RADIUS[n.cls] * (0.76 + clamp(n.weight, 0, 1) * 0.46) * clamp(Math.sqrt(relativeZoom), 0.66, 1.5),
    [relativeZoom],
  );

  // ---- paint -------------------------------------------------------------
  const anim = useRef<{ start: number } | null>(null);
  const drawRef = useRef<(now: number) => void>(() => {});

  const draw = useCallback(
    (frameTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !view || size.w === 0 || size.h === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = PALETTE.void;
      ctx.fillRect(0, 0, size.w, size.h);
      drawGrid(ctx, size, { x: view.tx, y: view.ty });

      const state = anim.current;
      /**
       * The arrival reveal fades nodes in; it never scales them.
       *
       * Radius carries meaning — observed activity on the measured map, a
       * structural weight on the preview — so animating it means any frame
       * that turns out to be the last one leaves every node misreporting its
       * own size. Opacity carries no such claim, so opacity is what moves.
       */
      const reveal = state ? easeOut(Math.min(1, (frameTime - state.start) / MOTION.event)) : 1;

      const activeId = selected?.kind === "node" ? selected.node.id : hover?.kind === "node" ? hover.node.id : null;
      const activeEdge = selected?.kind === "edge" ? selected.edge.id : hover?.kind === "edge" ? hover.edge.id : null;

      const focus = new Set<string>();
      if (activeId) {
        focus.add(activeId);
        for (const e of topology.edges) {
          if (e.source === activeId) focus.add(e.target);
          if (e.target === activeId) focus.add(e.source);
        }
      }
      const dim = (id: string) => (focus.size ? (focus.has(id) ? 1 : 0.26) : 1);

      ctx.lineCap = "round";
      for (const e of topology.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const pa = project(a);
        const pb = project(b);
        const curve = arc(pa, pb, e.id);
        const lit = e.id === activeEdge || (activeId ? e.source === activeId || e.target === activeId : false);
        const alpha = Math.min(dim(e.source), dim(e.target)) * reveal;

        const from = pointAt(curve, tForRadius(curve, radius(a) + 3, true));
        const to = pointAt(curve, tForRadius(curve, radius(b) + 5, false));
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(curve.cx, curve.cy, to.x, to.y);
        ctx.strokeStyle = lit ? PALETTE.signal : PALETTE.edge;
        ctx.globalAlpha = alpha * (lit ? 0.95 : 0.34 + e.intensity * 0.4);
        ctx.lineWidth = lit ? 1.6 : 0.7 + e.intensity * 0.9;
        ctx.stroke();

        const tip = pointAt(curve, tForRadius(curve, radius(b) + 4, false));
        const tail = pointAt(curve, tForRadius(curve, radius(b) + 15, false));
        drawArrow(ctx, tail, tip, lit ? PALETTE.signal : PALETTE.edge, alpha * (lit ? 1 : 0.7), lit ? 6.2 : 5);

        if (Math.hypot(pb.x - pa.x, pb.y - pa.y) > 96) {
          const mid = pointAt(curve, 0.5);
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, lit ? 2.3 : 1.6, 0, Math.PI * 2);
          ctx.fillStyle = lit ? PALETTE.signal : PALETTE.inkMuted;
          ctx.globalAlpha = alpha * (lit ? 0.95 : 0.45);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.textBaseline = "middle";
      const showLabels = size.w >= 460 || nodes.length <= 10;
      for (const n of nodes) {
        const p = project(n);
        const r = radius(n);
        const isActive = n.id === activeId;
        const a = dim(n.id) * reveal;
        const color = isActive ? PALETTE.signal : CLASS_COLOR[n.cls];

        ctx.globalAlpha = a;
        if (n.cls === "asset" || n.cls === "venue" || isActive) {
          drawHalo(ctx, p, r, color, isActive ? 0.3 : 0.16);
        }

        tracePath(ctx, n.cls, p, r);
        ctx.fillStyle = PALETTE.void;
        ctx.fill();
        if (isActive) {
          tracePath(ctx, n.cls, p, r);
          ctx.fillStyle = withAlpha(color, 0.24);
          ctx.fill();
        }
        tracePath(ctx, n.cls, p, r);
        ctx.strokeStyle = color;
        ctx.globalAlpha = a * (isActive ? 1 : 0.8);
        ctx.lineWidth = isActive ? 2 : 1.2;
        ctx.stroke();
        ctx.globalAlpha = a;

        if (showLabels || isActive) {
          ctx.font = `${n.cls === "asset" ? 10.5 : 9.5}px ui-monospace, "Geist Mono", monospace`;
          ctx.fillStyle = isActive ? PALETTE.ink : n.cls === "asset" ? PALETTE.inkMuted : PALETTE.inkFaint;
          const pad = r + 12;
          if (Math.abs(Math.cos(n.angle)) < 0.36) {
            ctx.textAlign = "center";
            ctx.fillText(n.label, p.x, p.y + (Math.sin(n.angle) > 0 ? pad + 2 : -pad - 2));
          } else {
            ctx.textAlign = Math.cos(n.angle) >= 0 ? "left" : "right";
            ctx.fillText(n.label, p.x + Math.cos(n.angle) * pad, p.y + Math.sin(n.angle) * pad);
          }
        }
        ctx.globalAlpha = 1;
      }
    },
    [topology.edges, nodes, byId, size, hover, selected, project, radius, view],
  );

  useEffect(() => {
    drawRef.current = draw;
    draw(performance.now());
  }, [draw]);

  /** One settle on arrival, then nothing. Never a loop. */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    anim.current = { start: performance.now() };
    let frame = 0;
    const tick = (now: number) => {
      const state = anim.current;
      if (!state) return;
      drawRef.current(now);
      if (now - state.start < MOTION.event) frame = requestAnimationFrame(tick);
      else {
        anim.current = null;
        frame = 0;
        // The settle paint. drawRef always holds the newest closure, so this
        // lands at the current size even if the viewport changed mid-window.
        drawRef.current(now);
      }
    };
    frame = requestAnimationFrame(tick);
    /**
     * The settle guarantee.
     *
     * requestAnimationFrame does not run in a hidden tab, so a map loaded in
     * the background would start its reveal, never advance it, and sit there
     * half-faded until something else happened to trigger a repaint. A timer
     * still fires when backgrounded, so it closes the window and paints the
     * final frame whatever the tab was doing.
     */
    const settle = setTimeout(() => {
      anim.current = null;
      drawRef.current(performance.now());
    }, MOTION.event + 80);

    return () => {
      clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
      anim.current = null;
    };
  }, [topology]);

  // ---- interaction -------------------------------------------------------
  const hitTest = useCallback(
    (x: number, y: number): PreviewHit | null => {
      let best: { node: Placed; d: number } | null = null;
      for (const n of nodes) {
        const p = project(n);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= radius(n) + 8 && (!best || d < best.d)) best = { node: n, d };
      }
      if (best) return { kind: "node", node: best.node };

      let edge: { edge: PreviewEdge; d: number } | null = null;
      for (const e of topology.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const d = distanceToCurve(x, y, arc(project(a), project(b), e.id));
        if (d < 7 && (!edge || d < edge.d)) edge = { edge: e, d };
      }
      return edge ? { kind: "edge", edge: edge.edge } : null;
    },
    [nodes, topology.edges, byId, project, radius],
  );

  const zoomAt = useCallback(
    (factor: number, at?: Point) => {
      adjust((v) => {
        const base = fitted?.k ?? v.k;
        const k = clamp(v.k * factor, base * MIN_ZOOM, base * MAX_ZOOM);
        const cx = at?.x ?? size.w / 2;
        const cy = at?.y ?? size.h / 2;
        const ratio = k / v.k;
        return { k, spread: v.spread, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio };
      });
    },
    [adjust, fitted, size.w, size.h],
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  /** Mirrored into state because the render reads it, and refs must not be. */
  const [dragging, setDragging] = useState(false);
  const pointerPos = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomAt(1.22);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomAt(1 / 1.22);
    } else if (e.key === "0") {
      e.preventDefault();
      resetView();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIndex + 1) % nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: nodes[next] });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusIndex - 1 + nodes.length) % nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: nodes[next] });
    } else if (e.key === "Escape") {
      onSelect(null);
    }
  };

  const tip = hover && pointer && !dragging ? describePreview(hover) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
        className="block"
        tabIndex={0}
        role="application"
        aria-label="FOLDMARK architecture preview: the structure the market topology is read in. Categories, not observations. Arrow keys step through categories, plus and minus zoom, 0 fits the view."
        onPointerDown={(e) => {
          const { x, y } = pointerPos(e);
          if (!view) return;
          drag.current = { x, y, tx: view.tx, ty: view.ty, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const { x, y } = pointerPos(e);
          const d = drag.current;
          if (d) {
            const dx = x - d.x;
            const dy = y - d.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
            if (d.moved) {
              if (!dragging) setDragging(true);
              adjust((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
              e.currentTarget.style.cursor = "grabbing";
              return;
            }
          }
          setPointer({ x, y });
          const hit = hitTest(x, y);
          setHover(hit);
          e.currentTarget.style.cursor = hit ? "pointer" : "grab";
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          e.currentTarget.style.cursor = "grab";
          if (d?.moved) return;
          const { x, y } = pointerPos(e);
          onSelect(hitTest(x, y));
        }}
        onPointerLeave={() => {
          setHover(null);
          setPointer(null);
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={onKeyDown}
      />

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-px border border-rule bg-void/90">
        {[
          { label: "−", title: "Zoom out", act: () => zoomAt(1 / 1.25) },
          { label: "+", title: "Zoom in", act: () => zoomAt(1.25) },
          { label: "FIT", title: "Fit to screen", act: resetView },
        ].map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-label={b.title}
            onClick={b.act}
            className="min-w-[2rem] px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            {b.label}
          </button>
        ))}
      </div>

      {tip && pointer ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 max-w-[230px] border border-rule-strong bg-elevated px-2.5 py-2"
          style={{
            left: Math.min(pointer.x + 14, Math.max(0, size.w - 240)),
            top: Math.min(pointer.y + 14, Math.max(0, size.h - 74)),
          }}
        >
          <p className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{tip.kicker}</p>
          <p className="mt-0.5 truncate font-mono text-data text-ink">{tip.title}</p>
        </div>
      ) : null}

      {/* Text equivalent. Categories only — there is nothing here to count. */}
      <ul className="sr-only">
        {nodes.map((n) => (
          <li key={n.id}>{n.label}: a category in the FOLDMARK structure layer.</li>
        ))}
      </ul>
    </div>
  );
}

/** Never denominated: a category and a relationship, and no third line. */
function describePreview(hit: PreviewHit): { kicker: string; title: string } {
  if (hit.kind === "node") return { kicker: "CATEGORY", title: hit.node.label };
  return { kicker: "RELATIONSHIP", title: "VALUE MOVES ALONG THIS EDGE" };
}
