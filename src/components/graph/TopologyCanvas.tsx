"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, MarketGraph } from "@/lib/graph";
import { compact, integer, shortAddress } from "@/lib/format";

/**
 * The market map.
 *
 * Canvas 2D, drawn on demand. There is no animation loop: the scene repaints
 * when the data, the viewport or the pointer changes, and otherwise the canvas
 * is completely still. A quiet market looks quiet.
 *
 * Everything drawn comes from MarketGraph, which is built from indexed
 * transfers. Node position encodes role (sender / asset / receiver), radius
 * encodes observed value, edge weight encodes value moved.
 */

const PALETTE = {
  void: "#080A08",
  rule: "rgba(242,240,232,0.10)",
  ruleFaint: "rgba(242,240,232,0.05)",
  ink: "#F2F0E8",
  inkMuted: "#A8ADA4",
  inkFaint: "#5C6259",
  signal: "#C7FF4A",
};

const PADDING = { x: 88, y: 34 };
const R_MIN = 3;
const R_MAX = 11;

type Hit = { kind: "node"; node: GraphNode } | { kind: "edge"; edge: GraphEdge };

export type TopologySelection = Hit | null;

export function TopologyCanvas({
  graph,
  onSelect,
  selected,
  className = "",
}: {
  graph: MarketGraph;
  onSelect: (hit: TopologySelection) => void;
  selected: TopologySelection;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hit | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [isolated, setIsolated] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

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
   * The canvas adapts to how much room it actually has: on a narrow viewport
   * the lanes sit closer to the edge, nodes shrink, and labels are dropped
   * rather than allowed to collide into an unreadable stack.
   */
  const metrics = useMemo(() => {
    const narrow = size.w < 560;
    const padX = narrow ? Math.max(38, size.w * 0.14) : PADDING.x;
    const rMax = narrow ? 7 : R_MAX;

    // vertical room per node in the busiest lane
    const perLane = new Map<string, number>();
    for (const n of graph.nodes) perLane.set(n.kind, (perLane.get(n.kind) ?? 0) + 1);
    const busiest = Math.max(1, ...perLane.values());
    const spacing = (size.h - PADDING.y * 2) / busiest;

    return { padX, rMax, labels: spacing >= 17 && !narrow ? "all" : spacing >= 17 ? "assets" : "none" };
  }, [graph.nodes, size.w, size.h]);

  const project = useCallback(
    (n: GraphNode) => ({
      x: metrics.padX + n.x * Math.max(1, size.w - metrics.padX * 2),
      y: PADDING.y + n.y * Math.max(1, size.h - PADDING.y * 2),
    }),
    [size.w, size.h, metrics.padX],
  );

  const radius = useCallback(
    (n: GraphNode) => R_MIN + n.scale * (metrics.rMax - R_MIN),
    [metrics.rMax],
  );

  // ---- paint -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const dim = (id: string) => (neighbourhood ? (neighbourhood.has(id) ? 1 : 0.16) : 1);
    const activeId = selected?.kind === "node" ? selected.node.id : hover?.kind === "node" ? hover.node.id : null;
    const activeEdge = selected?.kind === "edge" ? selected.edge.id : hover?.kind === "edge" ? hover.edge.id : null;

    // lane rules — the composition, drawn first
    ctx.strokeStyle = PALETTE.ruleFaint;
    ctx.lineWidth = 1;
    for (const lane of [0.08, 0.5, 0.92]) {
      const x = Math.round(metrics.padX + lane * (size.w - metrics.padX * 2)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.y - 14);
      ctx.lineTo(x, size.h - PADDING.y + 14);
      ctx.stroke();
    }

    // edges
    for (const e of graph.edges) {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) continue;
      const pa = project(a);
      const pb = project(b);
      const isActive = e.id === activeEdge;
      const touchesActive = activeId ? e.source === activeId || e.target === activeId : false;
      const alpha = Math.min(dim(e.source), dim(e.target)) * (0.14 + e.intensity * 0.34);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      // a shallow arc reads as a route rather than a wire
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2 + (b.y - a.y) * 12;
      ctx.quadraticCurveTo(mx, my, pb.x, pb.y);

      if (isActive || touchesActive) {
        ctx.strokeStyle = PALETTE.signal;
        ctx.globalAlpha = isActive ? 0.95 : 0.6;
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = PALETTE.ink;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.6 + e.intensity * 1.1;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // nodes
    ctx.textBaseline = "middle";
    for (const n of graph.nodes) {
      const p = project(n);
      const r = radius(n);
      const isActive = n.id === activeId;
      const a = dim(n.id);

      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);

      if (n.kind === "asset") {
        ctx.fillStyle = isActive ? PALETTE.signal : PALETTE.ink;
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.void;
        ctx.fill();
        ctx.strokeStyle = isActive ? PALETTE.signal : PALETTE.inkMuted;
        ctx.lineWidth = isActive ? 1.6 : 1;
        ctx.stroke();
      }

      // fresh: a single thin ring, no pulse, no glow
      if (n.fresh) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = PALETTE.signal;
        ctx.globalAlpha = a * 0.5;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = a;
      }

      // labels — drawn only where there is room, plus always for the active node
      const showLabel =
        isActive ||
        metrics.labels === "all" ||
        (metrics.labels === "assets" && n.kind === "asset");
      if (!showLabel) {
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.font = `${n.kind === "asset" ? "11" : "10"}px ui-monospace, "Geist Mono", monospace`;
      ctx.fillStyle = isActive ? PALETTE.ink : n.kind === "asset" ? PALETTE.inkMuted : PALETTE.inkFaint;
      const text = n.kind === "asset" ? n.label : shortAddress(n.label, 5, 3);
      if (n.kind === "source") {
        ctx.textAlign = "right";
        ctx.fillText(text, p.x - r - 8, p.y);
      } else if (n.kind === "destination") {
        ctx.textAlign = "left";
        ctx.fillText(text, p.x + r + 8, p.y);
      } else if (metrics.labels === "all") {
        ctx.textAlign = "center";
        ctx.fillText(text, p.x, p.y - r - 10);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(text, p.x + r + 6, p.y);
      }
      ctx.globalAlpha = 1;
    }

    // lane captions
    ctx.font = '9px ui-monospace, "Geist Mono", monospace';
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.textAlign = "left";
    ctx.fillText("SOURCE", 6, 12);
    ctx.textAlign = "center";
    ctx.fillText("ASSET", size.w / 2, 12);
    ctx.textAlign = "right";
    ctx.fillText("DESTINATION", size.w - 6, 12);
  }, [graph, size, hover, selected, neighbourhood, nodeById, project, radius, metrics]);

  // ---- hit testing -------------------------------------------------------
  const hitTest = useCallback(
    (x: number, y: number): Hit | null => {
      for (const n of graph.nodes) {
        const p = project(n);
        if (Math.hypot(p.x - x, p.y - y) <= radius(n) + 7) return { kind: "node", node: n };
      }
      let best: { edge: GraphEdge; d: number } | null = null;
      for (const e of graph.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const pa = project(a);
        const pb = project(b);
        const d = distanceToSegment(x, y, pa.x, pa.y, pb.x, pb.y);
        if (d < 6 && (!best || d < best.d)) best = { edge: e, d };
      }
      return best ? { kind: "edge", edge: best.edge } : null;
    },
    [graph, nodeById, project, radius],
  );

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPos(e);
    setPointer({ x, y });
    const hit = hitTest(x, y);
    setHover(hit);
    e.currentTarget.style.cursor = hit ? "pointer" : "default";
  };

  const onClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (!graph.nodes.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIndex + 1) % graph.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: graph.nodes[next] });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusIndex - 1 + graph.nodes.length) % graph.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: graph.nodes[next] });
    } else if (e.key === "Enter" && focusIndex >= 0) {
      e.preventDefault();
      setIsolated((cur) => (cur === graph.nodes[focusIndex].id ? null : graph.nodes[focusIndex].id));
    } else if (e.key === "Escape") {
      setIsolated(null);
      onSelect(null);
    }
  };

  const tooltip = hover && pointer ? describe(hover) : null;

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
        className="block"
        tabIndex={0}
        role="application"
        aria-label={`Market topology: ${graph.shown.nodes} nodes and ${graph.shown.edges} relationships from indexed transfers. Use arrow keys to step through nodes, Enter to isolate a neighbourhood, Escape to clear.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setHover(null);
          setPointer(null);
        }}
        onPointerUp={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />

      {tooltip && pointer ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 max-w-[240px] border border-rule-strong bg-elevated px-2.5 py-2"
          style={{
            left: Math.min(pointer.x + 14, Math.max(0, size.w - 250)),
            top: Math.min(pointer.y + 14, Math.max(0, size.h - 80)),
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
        {graph.nodes.map((n) => (
          <li key={n.id}>
            {n.kind === "asset" ? "Asset" : n.role} {n.label}: {integer(n.transfers)} transfers, {compact(n.weight)} units
            observed, {n.degree} connections.
          </li>
        ))}
      </ul>
    </div>
  );
}

function describe(hit: Hit): { kicker: string; title: string; detail: string } {
  if (hit.kind === "node") {
    const n = hit.node;
    return {
      kicker: n.kind === "asset" ? String(n.role).replace("_", " ") : n.role,
      title: n.kind === "asset" ? n.label : shortAddress(n.label, 8, 6),
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

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
