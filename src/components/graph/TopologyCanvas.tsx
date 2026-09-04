"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, MarketGraph } from "@/lib/graph";
import { buildContractIndex } from "@/lib/flow-classification";
import {
  layoutRadial,
  NODE_CLASS_LABEL,
  type Layout,
  type PlacedNode,
} from "@/lib/graph-semantics";
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
} from "@/components/graph/draw";
import { compact, integer, shortAddress } from "@/lib/format";
import { MOTION, easeOut, prefersReducedMotion } from "@/lib/motion";

/**
 * The market map.
 *
 * A plotting surface, not an illustration. Canvas 2D, drawn on demand: the
 * scene repaints when the data, the viewport, the view transform or the pointer
 * changes, and is otherwise completely still. Nothing orbits, breathes or
 * drifts. A quiet market looks quiet.
 *
 * Everything drawn comes from MarketGraph, built from indexed transfers.
 * Position encodes role (see graph-semantics), shape encodes what the contracts
 * registry says a node is, radius encodes observed activity and edge weight
 * encodes transfers. Nothing on the canvas is decorative — if it is drawn, it
 * was measured.
 */

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
const FIT_PADDING = 54;

type Hit = { kind: "node"; node: PlacedNode } | { kind: "edge"; edge: GraphEdge };

export type TopologySelection = Hit | null;

/** Screen-space transform. sx = wx * k * spread + tx. */
type View = { k: number; spread: number; tx: number; ty: number };

export function TopologyCanvas({
  graph,
  onSelect,
  selected,
  contracts = [],
  className = "",
}: {
  graph: MarketGraph;
  onSelect: (hit: TopologySelection) => void;
  selected: TopologySelection;
  /**
   * The contracts registry, as plain rows so it crosses the server/client
   * boundary without a Map. An empty registry is the honest default: every
   * address stays an address.
   */
  contracts?: { address: string; contract_type: string | null }[];
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hit | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const registry = useMemo(() => buildContractIndex(contracts), [contracts]);
  const layout = useMemo(() => layoutRadial(graph, registry), [graph, registry]);
  const nodeById = layout.byId;

  /** Neighbourhood of the isolated node — everything else is dimmed, not hidden. */
  const neighbourhood = useMemo(() => {
    if (!isolated) return null;
    const keep = new Set<string>([isolated]);
    for (const e of graph.edges) {
      if (e.source === isolated) keep.add(e.target);
      if (e.target === isolated) keep.add(e.source);
    }
    return keep;
  }, [isolated, graph.edges]);

  // ---- viewport ----------------------------------------------------------
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

  /**
   * Fit the whole graph in the viewport with room for labels.
   *
   * Labels are drawn outward from each node, so the fit pads generously rather
   * than pressing the outermost ring against the edge where its labels would be
   * clipped.
   */
  const fitView = useCallback((): View | null => {
    if (size.w === 0 || size.h === 0) return null;
    const b = layout.bounds;
    const spanX = Math.max(0.001, b.maxX - b.minX);
    const spanY = Math.max(0.001, b.maxY - b.minY);
    const usableW = Math.max(120, size.w - FIT_PADDING * 2);
    const usableH = Math.max(120, size.h - FIT_PADDING * 2);
    // Absolute bounds: this is the world-to-pixel scale, not a zoom level.
    // MIN_ZOOM and MAX_ZOOM are multiples of THIS, applied in zoomAt.
    const k = clamp(Math.min(usableW / spanX, usableH / spanY), 1, 4000);
    /**
     * A wide canvas gets an elliptical field rather than a small circle
     * marooned in the middle of it. Only POSITIONS stretch horizontally —
     * node shapes keep their aspect, so a hexagon never becomes an ellipse.
     */
    const spread = clamp(usableW / spanX / k, 1, 1.7);
    return {
      k,
      spread,
      tx: size.w / 2 - ((b.minX + b.maxX) / 2) * k * spread,
      ty: size.h / 2 - ((b.minY + b.maxY) / 2) * k,
    };
  }, [layout.bounds, size.w, size.h]);

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
  const [manual, setManual] = useState<{ of: Layout; view: View } | null>(null);
  const view = manual && manual.of === layout ? manual.view : fitted;

  /** Zoom expressed against the fitted view, so 1 always means "the whole map". */
  const relativeZoom = view && fitted ? view.k / fitted.k : 1;

  /** Apply a change to whatever the reader is currently looking at. */
  const adjust = useCallback(
    (fn: (v: View) => View) => {
      setManual((m) => {
        const base = m && m.of === layout ? m.view : fitted;
        return base ? { of: layout, view: fn(base) } : m;
      });
    },
    [layout, fitted],
  );

  /** Back to the fitted view: forget the reader's adjustment entirely. */
  const resetView = useCallback(() => setManual(null), []);

  const project = useCallback(
    (n: { wx: number; wy: number }) =>
      view ? { x: n.wx * view.k * view.spread + view.tx, y: n.wy * view.k + view.ty } : { x: 0, y: 0 },
    [view],
  );

  /**
   * Node radius in screen pixels.
   *
   * Zoom scales nodes, but sub-linearly and within bounds: at low zoom a node
   * stays big enough to hit, and at high zoom the graph does not turn into a
   * field of blobs. Observed activity still modulates the size, so a node that
   * moved more is larger than one beside it that moved less.
   */
  const radius = useCallback(
    (n: PlacedNode) => {
      const base = CLASS_RADIUS[n.nodeClass] * (0.78 + n.scale * 0.44) * (n.central ? 1.28 : 1);
      // Sub-linear in zoom: a node stays hittable when zoomed out and the field
      // does not turn into overlapping blobs when zoomed in.
      return base * clamp(Math.sqrt(relativeZoom), 0.66, 1.55);
    },
    [relativeZoom],
  );

  /**
   * One bounded arrival animation, then stillness. Nothing loops.
   */
  const anim = useRef<{ start: number } | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const drawRef = useRef<(now: number) => void>(() => {});

  // ---- paint -------------------------------------------------------------
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

      const activeId =
        selected?.kind === "node" ? selected.node.id : hover?.kind === "node" ? hover.node.id : null;
      const activeEdge =
        selected?.kind === "edge" ? selected.edge.id : hover?.kind === "edge" ? hover.edge.id : null;

      /** Everything not in focus recedes; nothing is ever hidden outright. */
      const focus = new Set<string>();
      if (activeId) {
        focus.add(activeId);
        for (const e of graph.edges) {
          if (e.source === activeId) focus.add(e.target);
          if (e.target === activeId) focus.add(e.source);
        }
      }
      const dim = (id: string) => {
        if (neighbourhood) return neighbourhood.has(id) ? 1 : 0.14;
        if (focus.size) return focus.has(id) ? 1 : 0.26;
        return 1;
      };

      // ---- edges ----------------------------------------------------------
      ctx.lineCap = "round";
      for (const e of graph.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;

        const pa = project(a);
        const pb = project(b);
        const curve = arc(pa, pb, e.id);
        const isActive = e.id === activeEdge;
        const touchesActive = activeId ? e.source === activeId || e.target === activeId : false;
        const lit = isActive || touchesActive;
        const alpha = Math.min(dim(e.source), dim(e.target)) * reveal;

        // Trim the curve to the node edges so the stroke starts and stops at the
        // shapes rather than under them, which is what makes direction legible.
        const from = pointAt(curve, tForRadius(curve, radius(a) + 3, true));
        const to = pointAt(curve, tForRadius(curve, radius(b) + 5, false));

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(curve.cx, curve.cy, to.x, to.y);
        ctx.strokeStyle = lit ? PALETTE.signal : PALETTE.edge;
        ctx.globalAlpha = alpha * (lit ? (isActive ? 1 : 0.85) : 0.38 + e.intensity * 0.42);
        ctx.lineWidth = lit ? 1.7 : 0.7 + e.intensity * 1.1;
        ctx.stroke();

        // Direction. An arrowhead at the receiving end, always — the map's whole
        // job is to say which way value went.
        const tip = pointAt(curve, tForRadius(curve, radius(b) + 4, false));
        const tail = pointAt(curve, tForRadius(curve, radius(b) + 15, false));
        drawArrow(ctx, tail, tip, lit ? PALETTE.signal : PALETTE.edge, alpha * (lit ? 1 : 0.72), lit ? 6.4 : 5.2);

        // A junction mark at the midpoint, only where the run is long enough to
        // carry one without crowding the ends.
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (len > 96) {
          const mid = pointAt(curve, 0.5);
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, lit ? 2.4 : 1.7, 0, Math.PI * 2);
          ctx.fillStyle = lit ? PALETTE.signal : PALETTE.inkMuted;
          ctx.globalAlpha = alpha * (lit ? 0.95 : 0.5);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ---- nodes ----------------------------------------------------------
      ctx.textBaseline = "middle";
      const labelMode = labelPolicy(layout.nodes.length, relativeZoom, size.w);

      for (const n of layout.nodes) {
        const p = project(n);
        const r = radius(n);
        if (p.x < -80 || p.x > size.w + 80 || p.y < -80 || p.y > size.h + 80) continue;

        const isActive = n.id === activeId;
        const a = dim(n.id) * reveal;
        const color = isActive ? PALETTE.signal : CLASS_COLOR[n.nodeClass];

        ctx.globalAlpha = a;

        // A restrained halo behind the classes that anchor the map. It reads as
        // depth on a near-black ground, not as a glow effect.
        if (n.nodeClass === "asset" || n.nodeClass === "venue" || isActive) {
          drawHalo(ctx, p, r, color, isActive ? 0.3 : 0.18);
        }

        tracePath(ctx, n.nodeClass, p, r);
        ctx.fillStyle = PALETTE.void;
        ctx.fill();

        // The centre of the map, when one was measured, is filled rather than
        // outlined — the only node that gets that treatment.
        if (n.central || isActive) {
          tracePath(ctx, n.nodeClass, p, r);
          ctx.fillStyle = withAlpha(color, n.central ? 0.9 : 0.24);
          ctx.fill();
        }

        tracePath(ctx, n.nodeClass, p, r);
        ctx.strokeStyle = color;
        ctx.globalAlpha = a * (isActive || n.central ? 1 : 0.82);
        ctx.lineWidth = isActive ? 2 : n.central ? 1.7 : 1.2;
        ctx.stroke();
        ctx.globalAlpha = a;

        // Newest indexed block: one thin ring. No pulse, no glow.
        if (n.fresh) {
          tracePath(ctx, n.nodeClass, p, r + 5);
          ctx.strokeStyle = PALETTE.signal;
          ctx.globalAlpha = a * 0.45;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = a;
        }

        // ---- label --------------------------------------------------------
        const show = isActive || n.central || labelMode === "all" || (labelMode === "anchors" && n.nodeClass !== "address");
        if (!show) {
          ctx.globalAlpha = 1;
          continue;
        }

        const isAsset = n.nodeClass === "asset";
        ctx.font = `${isAsset ? 11.5 : 10}px ui-monospace, "Geist Mono", monospace`;
        ctx.fillStyle = isActive ? PALETTE.ink : isAsset ? PALETTE.ink : PALETTE.inkMuted;
        const text = isAsset ? n.label : shortAddress(n.label, 6, 4);

        // Labels radiate outward, so they fall away from the graph rather than
        // across it. The centre has no outward direction, so its label sits
        // below. A node pointing near-vertically gets a centred label above or
        // below it, because a left-aligned one there reads as belonging to
        // whatever sits to its right.
        const out = n.central ? Math.PI / 2 : n.angle;
        const pad = r + 12;
        const vertical = Math.abs(Math.cos(out)) < 0.36;
        if (n.central || vertical) {
          ctx.textAlign = "center";
          const below = n.central || Math.sin(out) > 0;
          ctx.fillText(text, p.x, p.y + (below ? pad + 2 : -pad - 2));
        } else {
          ctx.textAlign = Math.cos(out) >= 0 ? "left" : "right";
          ctx.fillText(text, p.x + Math.cos(out) * pad, p.y + Math.sin(out) * pad);
        }
        ctx.globalAlpha = 1;
      }

      ctx.globalAlpha = 1;
    },
    [graph.edges, layout, size, hover, selected, neighbourhood, nodeById, project, radius, relativeZoom, view],
  );

  useEffect(() => {
    drawRef.current = draw;
    draw(performance.now());
  }, [draw]);

  /**
   * One settle when the map first arrives, and nothing after it. A viewer who
   * has asked for reduced motion never enters it at all.
   */
  useEffect(() => {
    const ids = graph.nodes.map((n) => n.id).join("|");
    const first = seen.current === null;
    const changed = !seen.current || !seen.current.has(ids);
    seen.current = new Set([ids]);
    if (!first && !changed) return;
    if (prefersReducedMotion()) return;

    anim.current = { start: performance.now() };
    let frame = 0;
    const tick = (now: number) => {
      const state = anim.current;
      if (!state) return;
      drawRef.current(now);
      if (now - state.start < MOTION.event) {
        frame = requestAnimationFrame(tick);
      } else {
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
  }, [graph.nodes]);

  // ---- hit testing -------------------------------------------------------
  const hitTest = useCallback(
    (x: number, y: number): Hit | null => {
      let bestNode: { node: PlacedNode; d: number } | null = null;
      for (const n of layout.nodes) {
        const p = project(n);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= radius(n) + 8 && (!bestNode || d < bestNode.d)) bestNode = { node: n, d };
      }
      if (bestNode) return { kind: "node", node: bestNode.node };

      let best: { edge: GraphEdge; d: number } | null = null;
      for (const e of graph.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const d = distanceToCurve(x, y, arc(project(a), project(b), e.id));
        if (d < 7 && (!best || d < best.d)) best = { edge: e, d };
      }
      return best ? { kind: "edge", edge: best.edge } : null;
    },
    [layout.nodes, graph.edges, nodeById, project, radius],
  );

  // ---- pan and zoom ------------------------------------------------------
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  /** Mirrored into state because the render reads it, and refs must not be. */
  const [dragging, setDragging] = useState(false);

  const pointerPos = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Zoom about a screen point, so what is under the cursor stays under it. */
  const zoomAt = useCallback(
    (factor: number, at?: { x: number; y: number }) => {
      adjust((v) => {
        const base = fitted?.k ?? v.k;
        const k = clamp(v.k * factor, base * MIN_ZOOM, base * MAX_ZOOM);
        const cx = at?.x ?? size.w / 2;
        const cy = at?.y ?? size.h / 2;
        const ratio = k / v.k;
        // spread is a property of the field, not of the zoom, so it rides along.
        return { k, spread: v.spread, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio };
      });
    },
    [adjust, fitted, size.w, size.h],
  );

  /**
   * Wheel zoom, bound natively so it can be passive:false.
   *
   * React's onWheel is passive, which means preventDefault() there is ignored
   * and the page scrolls behind the map while it zooms. Binding directly is the
   * only way the canvas can own the gesture.
   */
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

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPos(e);
    if (!view) return;
    drag.current = { x, y, tx: view.tx, ty: view.ty, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    e.currentTarget.style.cursor = "grab";
    // A drag moves the view; only a click selects.
    if (d?.moved) return;
    const { x, y } = pointerPos(e);
    const hit = hitTest(x, y);
    onSelect(hit);
    if (!hit) setIsolated(null);
  };

  const onDoubleClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPos(e);
    const hit = hitTest(x, y);
    if (hit?.kind === "node") setIsolated((cur) => (cur === hit.node.id ? null : hit.node.id));
  };

  // ---- keyboard ----------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomAt(1.22);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomAt(1 / 1.22);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      resetView();
      return;
    }
    if (!layout.nodes.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIndex + 1) % layout.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: layout.nodes[next] });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusIndex - 1 + layout.nodes.length) % layout.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: layout.nodes[next] });
    } else if (e.key === "Enter" && focusIndex >= 0) {
      e.preventDefault();
      setIsolated((cur) => (cur === layout.nodes[focusIndex].id ? null : layout.nodes[focusIndex].id));
    } else if (e.key === "Escape") {
      setIsolated(null);
      onSelect(null);
    }
  };

  const tooltip = hover && pointer && !dragging ? describe(hover) : null;

  return (
    <div ref={wrapRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
        className="block"
        tabIndex={0}
        role="application"
        aria-label={`Market topology: ${graph.shown.nodes} nodes and ${graph.shown.edges} relationships from indexed transfers. Arrow keys step through nodes, Enter isolates a neighbourhood, plus and minus zoom, 0 fits the view, Escape clears.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          setPointer(null);
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />

      {/* view controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-px border border-rule bg-void/90">
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

      {tooltip && pointer ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 max-w-[248px] border border-rule-strong bg-elevated px-2.5 py-2"
          style={{
            left: Math.min(pointer.x + 14, Math.max(0, size.w - 258)),
            top: Math.min(pointer.y + 14, Math.max(0, size.h - 82)),
          }}
        >
          <p className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{tooltip.kicker}</p>
          <p className="mt-0.5 truncate font-mono text-data text-ink">{tooltip.title}</p>
          <p className="mt-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted">{tooltip.detail}</p>
        </div>
      ) : null}

      {isolated ? (
        <button
          type="button"
          onClick={() => setIsolated(null)}
          className="absolute left-3 top-3 z-10 border border-signal/40 bg-void px-2 py-1 font-mono text-label-s uppercase tracking-[0.16em] text-signal"
        >
          ISOLATED — CLEAR
        </button>
      ) : null}

      {/* Text equivalent: the same data, reachable without the canvas. */}
      <ul className="sr-only">
        {layout.nodes.map((n) => (
          <li key={n.id}>
            {NODE_CLASS_LABEL[n.nodeClass]} {n.label}: {integer(n.transfers)} transfers, {compact(n.weight)} units
            observed, {n.degree} connections.
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How much text the map can carry without turning into a stack of collisions.
 * Anchors — assets, venues, protocols, oracles — keep their labels longest,
 * because they are what a reader navigates by.
 */
function labelPolicy(nodeCount: number, zoom: number, width: number): "all" | "anchors" | "none" {
  if (width < 460) return nodeCount > 10 ? "none" : "anchors";
  // Zooming in buys room, so a dense graph gets its labels back on the way in.
  if (nodeCount <= 18 || zoom > 1.6) return "all";
  if (nodeCount <= 44) return "anchors";
  return "none";
}

function describe(hit: Hit): { kicker: string; title: string; detail: string } {
  if (hit.kind === "node") {
    const n = hit.node;
    return {
      kicker: n.nodeClass === "asset" ? String(n.role).replace("_", " ") : NODE_CLASS_LABEL[n.nodeClass],
      title: n.nodeClass === "asset" ? n.label : shortAddress(n.label, 8, 6),
      detail: `${integer(n.transfers)} TX · ${compact(n.weight)} UNITS · ${n.degree} LINKS`,
    };
  }
  const e = hit.edge;
  return {
    kicker: "RELATIONSHIP",
    title: `${shortAddress(e.source, 5, 3)} → ${shortAddress(e.target, 5, 3)}`,
    detail: `${compact(e.weight)} ${e.assetSymbol ?? "UNITS"} · ${integer(e.transfers)} TX`,
  };
}



