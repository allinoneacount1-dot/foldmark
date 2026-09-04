"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopologyCanvas, type TopologySelection } from "@/components/graph/TopologyCanvas";
import type { MarketGraph } from "@/lib/graph";
import { compact, integer, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";
import { IconClose, IconExternal } from "@/components/icons";
import type { DataState } from "@/lib/data-state";
import { MOTION, easeOut, prefersReducedMotion, pulseCurve } from "@/lib/motion";
import {
  previewTopology,
  type PreviewEdge,
  type PreviewNode,
  type PreviewNodeKind,
  type PreviewTopology,
} from "@/lib/presentation-preview";

/**
 * The topology instrument: canvas plus inspector.
 *
 * Selection state lives here so the canvas stays a pure renderer. The inspector
 * docks as a third column on wide screens and as a bottom sheet on narrow ones,
 * which is the mobile adaptation the brief asks for — not a shrunken desktop.
 *
 * With nothing observed, the instrument does not go blank and apologise. It
 * draws the ARCHITECTURE PREVIEW: the same three lanes, the same node and edge
 * grammar, populated with categories instead of entities. A topology is a
 * picture of product STRUCTURE, and that structure is real whether or not a
 * particular market has been indexed yet. The moment a measured graph exists,
 * the preview is not consulted — real data always wins.
 */
export function TopologyView({
  graph,
  className = "",
}: {
  graph: MarketGraph;
  className?: string;
  /**
   * Accepted so existing callers keep type-checking. Both are superseded by the
   * architecture preview, which draws the structure rather than printing a
   * sentence about an absence into the middle of an empty rectangle.
   */
  emptyHint?: string;
  state?: DataState;
}) {
  const [selected, setSelected] = useState<TopologySelection>(null);

  if (!graph.nodes.length) {
    return <ArchitecturePreview className={className} />;
  }

  return (
    <div className={`relative flex min-h-0 flex-1 ${className}`}>
      <div className="min-h-0 min-w-0 flex-1">
        <TopologyCanvas graph={graph} selected={selected} onSelect={setSelected} />
      </div>

      {selected ? (
        /* The inspector enters from the edge it is docked to — a bottom sheet
           on narrow screens, a third column on wide ones. Changing entity
           crossfades the contents rather than closing and reopening the panel,
           which is why the key is the selection, not the panel itself.

           The raised tone belongs to the READOUT, not to the column. As a flex
           child the column stretches to the full height of the canvas, and
           painting it raised left a tall block of empty lighter ground under
           the last field — a rectangle with nothing in it. So at lg the column
           carries only its left hairline over the page ground, and the panel
           closes on a rule where its content actually ends. */
        <div className="m-enter-rise absolute inset-x-0 bottom-0 z-20 border-t border-rule bg-raised lg:m-enter-slide lg:static lg:w-[17rem] lg:shrink-0 lg:border-t-0 lg:border-l lg:bg-void">
          <div key={selectionKey(selected)} className="m-enter-fade lg:border-b lg:border-rule lg:bg-raised">
            <Inspector selection={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   ARCHITECTURE PREVIEW

   What replaced the empty canvas.

   THE RULE THIS SECTION IS BUILT AROUND: it draws STRUCTURE and never a
   MEASUREMENT. Every node is a category — ASSET A, WALLET CLUSTER, MARKET,
   LIQUIDITY, PROTOCOL — and nothing on screen is denominated: no amount, no
   count, no percentage, no address, no symbol. Node radius comes from a
   structural weight and edge stroke from a structural intensity; neither is a
   quantity of anything, and neither is ever printed as text.

   The geometry comes from previewTopology(), which is pure, seeded and held by
   a test on the far side of every module that could turn a drawing into a
   published number.
   ========================================================================== */

/** Mirrors TopologyCanvas, so the preview and the measured graph read as one map. */
const PREVIEW_PALETTE = {
  void: "#080A08",
  ruleFaint: "rgba(242,240,232,0.05)",
  ink: "#F2F0E8",
  inkMuted: "#A8ADA4",
  inkFaint: "#5C6259",
  signal: "#C7FF4A",
} as const;

const PADDING = { x: 88, y: 34 };
const R_MIN = 3;
const R_MAX = 11;

/** One initialization sweep, then the canvas is still. Nothing here loops. */
const INTRO_MS = 1100;

type PreviewHit = { kind: "node"; node: PreviewNode } | { kind: "edge"; edge: PreviewEdge };

/**
 * What each category IS, in the architecture.
 *
 * These describe a role in a structure, not a finding about a market. None of
 * them can be read as a quantity, an identity or an observation.
 */
const KIND_META: Record<PreviewNodeKind, { lane: string; type: string; role: string }> = {
  wallet: { lane: "SOURCE", type: "WALLET", role: "HOLDER GROUPING" },
  asset: { lane: "ASSET", type: "ASSET", role: "TRADED INSTRUMENT" },
  market: { lane: "DESTINATION", type: "VENUE", role: "TRADING VENUE" },
  protocol: { lane: "DESTINATION", type: "PROTOCOL", role: "CONTRACT COUNTERPARTY" },
};

/** A category whose role is narrower than the default for its lane. */
const ROLE_BY_LABEL: Record<string, string> = { LIQUIDITY: "VENUE DEPTH" };

function meta(node: PreviewNode) {
  const base = KIND_META[node.kind];
  return { ...base, role: ROLE_BY_LABEL[node.label] ?? base.role };
}

/**
 * The legend, written beside the renderer it describes.
 *
 * Every line documents an encoding that is actually on screen, and the last
 * line states what the drawing is — so a reading of the map cannot drift into
 * a reading of a market.
 */
const PREVIEW_LEGEND: readonly (readonly [string, string])[] = [
  ["POSITION", "Wallets left · assets centre · venues right"],
  ["NODE", "A category the structure layer holds"],
  ["EDGE", "A relationship value moves along"],
  ["SOURCE", "Product architecture — not an observation"],
];

function ArchitecturePreview({ className = "" }: { className?: string }) {
  const topology = useMemo(() => previewTopology(), []);
  const [selected, setSelected] = useState<PreviewHit | null>(null);

  return (
    <div className={`relative flex min-h-[22rem] min-w-0 flex-1 ${className}`}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-void">
        <div className="relative min-h-0 flex-1">
          <PreviewCanvas topology={topology} selected={selected} onSelect={setSelected} />

          {/* The only mode label in the instrument. Bottom right, clear of the
              lane captions along the top and of every drawn node label. */}
          <span className="pointer-events-none absolute bottom-3 right-3 z-10 border border-signal/30 bg-void/85 px-2 py-1 font-mono text-label-s uppercase tracking-[0.18em] text-signal">
            ARCHITECTURE PREVIEW
          </span>
        </div>

        <div className="shrink-0 border-t border-rule-faint bg-void">
          <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-1.5 px-4 py-2.5 sm:px-6">
            {PREVIEW_LEGEND.map(([term, def]) => (
              <div key={term} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <dt className="label-s shrink-0">{term}</dt>
                <dd className="text-body-s text-ink-faint">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* The inspector keeps its column so the instrument is never half a
          layout. It holds the lane key until something is selected. As with the
          measured instrument, the raised tone is painted behind the READOUT and
          not down the whole column, so nothing below the last field becomes a
          lighter rectangle a reader has to interpret. */}
      <div className="relative hidden w-[17rem] shrink-0 flex-col border-l border-rule bg-void lg:flex">
        <div key={selected ? previewKey(selected) : "idle"} className="m-enter-fade border-b border-rule bg-raised">
          <PreviewInspector selection={selected} nodes={topology.nodes} onClose={() => setSelected(null)} />
        </div>
      </div>

      {/* Narrow screens get the same inspector as a bottom sheet. */}
      {selected ? (
        <div className="m-enter-rise absolute inset-x-0 bottom-0 z-20 border-t border-rule bg-raised lg:hidden">
          <div key={previewKey(selected)} className="m-enter-fade">
            <PreviewInspector selection={selected} nodes={topology.nodes} onClose={() => setSelected(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function previewKey(hit: PreviewHit): string {
  return hit.kind === "edge" ? "edge:" + hit.edge.id : "node:" + hit.node.id;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* --------------------------------------------------------- preview canvas */

/**
 * The preview renderer.
 *
 * Deliberately the same drawing grammar as the measured canvas: three lane
 * rules, quadratic edges, filled assets and stroked addresses, labels only
 * where there is room. Someone who learns to read this map has learned to read
 * the real one, because the composition is identical — the difference is that
 * every node here names a category, and no figure is drawn at all.
 */
function PreviewCanvas({
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
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const nodeById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology.nodes]);

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

  const metrics = useMemo(() => {
    const narrow = size.w < 560;
    const padX = narrow ? Math.max(38, size.w * 0.14) : PADDING.x;
    const rMax = narrow ? 7 : R_MAX;

    const perLane = new Map<string, number>();
    for (const n of topology.nodes) perLane.set(n.kind, (perLane.get(n.kind) ?? 0) + 1);
    const busiest = Math.max(1, ...perLane.values());
    const spacing = (size.h - PADDING.y * 2) / busiest;

    return { padX, rMax, labels: spacing >= 17 && !narrow ? "all" : spacing >= 17 ? "assets" : "none" };
  }, [topology.nodes, size.w, size.h]);

  const project = useCallback(
    (n: PreviewNode) => ({
      x: metrics.padX + n.x * Math.max(1, size.w - metrics.padX * 2),
      y: PADDING.y + n.y * Math.max(1, size.h - PADDING.y * 2),
    }),
    [size.w, size.h, metrics.padX],
  );

  /** Weight drives a radius and nothing else. It is never printed. */
  const radius = useCallback((n: PreviewNode) => R_MIN + clamp01(n.weight) * (metrics.rMax - R_MIN), [metrics.rMax]);

  /**
   * Two bounded animations, and no third.
   *
   * One initialization sweep when the surface first has a size, and one pulse
   * when a node is selected. Both end; the driver cancels itself and the canvas
   * stops repainting entirely. A permanently animated market map is a claim
   * about movement, which is the exact failure this whole file exists to avoid.
   */
  const introStart = useRef<number | null>(null);
  const introArmed = useRef(false);
  const pulse = useRef<{ id: string; start: number } | null>(null);
  const drawRef = useRef<(now: number) => void>(() => {});
  const frameRef = useRef(0);

  const ensureLoop = useCallback(() => {
    if (frameRef.current) return;
    const tick = (now: number) => {
      drawRef.current(now);
      const introRunning = introStart.current !== null && now - introStart.current < INTRO_MS;
      const pulseRunning = pulse.current !== null && now - pulse.current.start < MOTION.event;
      if (introRunning || pulseRunning) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      frameRef.current = 0;
      pulse.current = null;
      drawRef.current(now); // settle to the static scene
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  // Arm the sweep once, before the first paint that has room to draw in.
  useEffect(() => {
    if (!size.w || !size.h || introArmed.current) return;
    introArmed.current = true;
    if (prefersReducedMotion()) return; // introStart stays null: drawn complete, at rest
    introStart.current = performance.now();
    ensureLoop();
  }, [size.w, size.h, ensureLoop]);

  useEffect(() => {
    if (!selected || selected.kind !== "node" || prefersReducedMotion()) return;
    pulse.current = { id: selected.node.id, start: performance.now() };
    ensureLoop();
  }, [selected, ensureLoop]);

  // ---- paint -------------------------------------------------------------
  const draw = useCallback(
    (frameTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas || size.w === 0 || size.h === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);

      const started = introStart.current;
      const introP = started === null ? 1 : clamp01((frameTime - started) / INTRO_MS);
      /** The structure resolves left to right, the direction the map is read. */
      const reveal = (x: number) => (introP >= 1 ? 1 : easeOut(clamp01((introP - x * 0.5) / 0.5)));

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
      const dim = (id: string) => (focus.size ? (focus.has(id) ? 1 : 0.42) : 1);

      // lane rules — the composition, drawn first
      ctx.strokeStyle = PREVIEW_PALETTE.ruleFaint;
      ctx.lineWidth = 1;
      for (const lane of [0.08, 0.5, 0.92]) {
        const x = Math.round(metrics.padX + lane * (size.w - metrics.padX * 2)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, PADDING.y - 14);
        ctx.lineTo(x, size.h - PADDING.y + 14);
        ctx.stroke();
      }

      // edges
      for (const e of topology.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const entered = Math.min(reveal(a.x), reveal(b.x));
        if (entered <= 0.001) continue;

        const pa = project(a);
        const pb = project(b);
        const isActive = e.id === activeEdge;
        const touchesActive = activeId ? e.source === activeId || e.target === activeId : false;

        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        // a shallow arc reads as a route rather than a wire
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2 + (b.y - a.y) * 12;
        ctx.quadraticCurveTo(mx, my, pb.x, pb.y);

        if (isActive || touchesActive) {
          ctx.strokeStyle = PREVIEW_PALETTE.signal;
          ctx.globalAlpha = (isActive ? 0.95 : 0.6) * entered;
          ctx.lineWidth = 1.4;
        } else {
          ctx.strokeStyle = PREVIEW_PALETTE.ink;
          ctx.globalAlpha = Math.min(dim(e.source), dim(e.target)) * (0.14 + e.intensity * 0.34) * entered;
          ctx.lineWidth = 0.6 + e.intensity * 1.1;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // nodes
      const pulsing = pulse.current;
      const pulseP = pulsing ? clamp01((frameTime - pulsing.start) / MOTION.event) : 1;

      ctx.textBaseline = "middle";
      for (const n of topology.nodes) {
        const a = dim(n.id) * reveal(n.x);
        if (a <= 0.001) continue;

        const p = project(n);
        const r = radius(n);
        const isActive = n.id === activeId;

        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);

        if (n.kind === "asset") {
          ctx.fillStyle = isActive ? PREVIEW_PALETTE.signal : PREVIEW_PALETTE.ink;
          ctx.fill();
        } else {
          ctx.fillStyle = PREVIEW_PALETTE.void;
          ctx.fill();
          ctx.strokeStyle = isActive ? PREVIEW_PALETTE.signal : PREVIEW_PALETTE.inkMuted;
          ctx.lineWidth = isActive ? 1.6 : 1;
          ctx.stroke();
        }

        // selection pulse: one ring, out and gone
        if (pulsing && pulsing.id === n.id && pulseP < 1) {
          const strength = pulseCurve(pulseP);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5 + strength * 9, 0, Math.PI * 2);
          ctx.strokeStyle = PREVIEW_PALETTE.signal;
          ctx.globalAlpha = a * strength * 0.5;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = a;
        }

        const showLabel = isActive || metrics.labels === "all" || (metrics.labels === "assets" && n.kind === "asset");
        if (!showLabel) {
          ctx.globalAlpha = 1;
          continue;
        }
        ctx.font = `${n.kind === "asset" ? "11" : "10"}px ui-monospace, "Geist Mono", monospace`;
        ctx.fillStyle = isActive
          ? PREVIEW_PALETTE.ink
          : n.kind === "asset"
            ? PREVIEW_PALETTE.inkMuted
            : PREVIEW_PALETTE.inkFaint;

        if (n.kind === "wallet") {
          ctx.textAlign = "right";
          ctx.fillText(n.label, p.x - r - 8, p.y);
        } else if (n.kind !== "asset") {
          ctx.textAlign = "left";
          ctx.fillText(n.label, p.x + r + 8, p.y);
        } else if (metrics.labels === "all") {
          ctx.textAlign = "center";
          ctx.fillText(n.label, p.x, p.y - r - 10);
        } else {
          ctx.textAlign = "left";
          ctx.fillText(n.label, p.x + r + 6, p.y);
        }
        ctx.globalAlpha = 1;
      }

      // lane captions — the same three words the measured canvas uses
      ctx.font = '9px ui-monospace, "Geist Mono", monospace';
      ctx.fillStyle = PREVIEW_PALETTE.inkFaint;
      ctx.textAlign = "left";
      ctx.fillText("SOURCE", 6, 12);
      ctx.textAlign = "center";
      ctx.fillText("ASSET", size.w / 2, 12);
      ctx.textAlign = "right";
      ctx.fillText("DESTINATION", size.w - 6, 12);

      // the initialization sweep itself, over the top, once
      if (introP < 1) {
        const sx = -80 + introP * (size.w + 160);
        const fade = introP > 0.82 ? 1 - (introP - 0.82) / 0.18 : 1;
        const gradient = ctx.createLinearGradient(sx - 80, 0, sx + 80, 0);
        gradient.addColorStop(0, "rgba(199,255,74,0)");
        gradient.addColorStop(0.5, "rgba(199,255,74,0.10)");
        gradient.addColorStop(1, "rgba(199,255,74,0)");
        ctx.globalAlpha = fade;
        ctx.fillStyle = gradient;
        ctx.fillRect(sx - 80, 0, 160, size.h);
        ctx.globalAlpha = 1;
      }
    },
    [topology, size, hover, selected, nodeById, project, radius, metrics],
  );

  useEffect(() => {
    drawRef.current = draw;
    draw(performance.now());
  }, [draw]);

  // ---- hit testing -------------------------------------------------------
  const hitTest = useCallback(
    (x: number, y: number): PreviewHit | null => {
      for (const n of topology.nodes) {
        const p = project(n);
        if (Math.hypot(p.x - x, p.y - y) <= radius(n) + 7) return { kind: "node", node: n };
      }
      let best: { edge: PreviewEdge; d: number } | null = null;
      for (const e of topology.edges) {
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
    [topology, nodeById, project, radius],
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

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPos(e);
    onSelect(hitTest(x, y));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!topology.nodes.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (focusIndex + 1) % topology.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: topology.nodes[next] });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (focusIndex - 1 + topology.nodes.length) % topology.nodes.length;
      setFocusIndex(next);
      onSelect({ kind: "node", node: topology.nodes[next] });
    } else if (e.key === "Escape") {
      setFocusIndex(-1);
      onSelect(null);
    }
  };

  const tip = hover ? describePreview(hover, nodeById) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
        className="block"
        tabIndex={0}
        role="application"
        aria-label="Architecture preview of the market topology: wallet clusters on the left, assets in the centre, venues and protocols on the right. Nodes are categories, and nothing drawn is an observation. Use arrow keys to step through nodes, Escape to clear."
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setHover(null);
          setPointer(null);
        }}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      />

      {tip && pointer ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 max-w-[240px] border border-rule-strong bg-elevated px-2.5 py-2"
          style={{
            left: Math.min(pointer.x + 14, Math.max(0, size.w - 250)),
            top: Math.min(pointer.y + 14, Math.max(0, size.h - 80)),
          }}
        >
          <p className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{tip.kicker}</p>
          <p className="mt-0.5 truncate font-mono text-data text-ink">{tip.title}</p>
          <p className="mt-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted">{tip.detail}</p>
        </div>
      ) : null}

      {/* Text equivalent: the same structure, reachable without the canvas. */}
      <ul className="sr-only">
        {topology.nodes.map((n) => {
          const m = meta(n);
          return (
            <li key={n.id}>
              {n.label}: {m.type}, {m.lane} lane, {m.role}.
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describePreview(
  hit: PreviewHit,
  nodeById: Map<string, PreviewNode>,
): { kicker: string; title: string; detail: string } {
  if (hit.kind === "node") {
    const m = meta(hit.node);
    return { kicker: m.type, title: hit.node.label, detail: `${m.lane} LANE · ${m.role}` };
  }
  const a = nodeById.get(hit.edge.source);
  const b = nodeById.get(hit.edge.target);
  return {
    kicker: "RELATIONSHIP",
    title: `${a?.label ?? "CATEGORY"} → ${b?.label ?? "CATEGORY"}`,
    detail: "STRUCTURAL LINK",
  };
}

/* ------------------------------------------------------ preview inspector */

/**
 * The inspector in preview mode.
 *
 * It names a category, its lane and its role, and says which mode it speaks in.
 * It has no analytics section, because there is nothing measured to put in one
 * — no count, no amount, no address, and no link to an explorer for something
 * that does not exist.
 */
function PreviewInspector({
  selection,
  nodes,
  onClose,
}: {
  selection: PreviewHit | null;
  nodes: readonly PreviewNode[];
  onClose: () => void;
}) {
  if (!selection) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
          <span className="label text-ink-dim">INSPECTOR</span>
        </div>
        <div className="border-b border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">NOTHING SELECTED</p>
          <p className="mt-2 text-body-s text-ink-muted">
            Hover a node to name it. Select one to read its place in the structure.
          </p>
        </div>
        <Row label="SOURCE LANE" value="WALLETS" />
        <Row label="CENTRE LANE" value="ASSETS" />
        <Row label="DESTINATION LANE" value="VENUES" />
        <p className="label-s px-4 py-3 normal-case tracking-[0.02em] text-ink-faint">
          The lanes are product structure, so they are drawn before anything has been observed. Measured nodes take
          these same positions the moment value moves.
        </p>
      </div>
    );
  }

  if (selection.kind === "edge") {
    // Endpoint names are the CATEGORIES the edge joins, resolved from the same
    // geometry the canvas drew. Nothing is looked up, because nothing is real.
    const from = nodes.find((n) => n.id === selection.edge.source);
    const to = nodes.find((n) => n.id === selection.edge.target);
    return (
      <div className="flex flex-col">
        <Head title="RELATIONSHIP" onClose={onClose} />
        <Row label="FROM" value={from?.label ?? "CATEGORY"} />
        <Row label="TO" value={to?.label ?? "CATEGORY"} />
        <Row label="MODE" value="ARCHITECTURE PREVIEW" />
        <p className="label-s px-4 py-3 normal-case tracking-[0.02em] text-ink-faint">
          An edge in the preview shows where a relationship can exist. It carries no amount and no transfer count,
          because none has been observed along it.
        </p>
      </div>
    );
  }

  const n = selection.node;
  const m = meta(n);
  return (
    <div className="flex flex-col">
      <Head title={m.type} onClose={onClose} />
      <div className="border-b border-rule-faint px-4 py-3">
        <p className="truncate font-mono text-data-l text-ink">{n.label}</p>
        <p className="label-s mt-1">{m.lane} LANE</p>
      </div>
      <Row label="NODE TYPE" value={m.type} />
      <Row label="ROLE" value={m.role} />
      <Row label="MODE" value="ARCHITECTURE PREVIEW" />
      <p className="label-s px-4 py-3 normal-case tracking-[0.02em] text-ink-faint">
        A category, not an entity. Nothing here has been indexed, so there is no address, no balance and no transfer
        count to show — the node states where such a thing will sit.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- inspector */

/** Identity of the inspected thing, so a change crossfades its contents. */
function selectionKey(selection: NonNullable<TopologySelection>): string {
  return selection.kind === "edge" ? "edge:" + selection.edge.id : "node:" + selection.node.id;
}

function Inspector({ selection, onClose }: { selection: NonNullable<TopologySelection>; onClose: () => void }) {
  if (selection.kind === "edge") {
    const e = selection.edge;
    return (
      <div className="flex flex-col">
        <Head title="RELATIONSHIP" onClose={onClose} />
        <Row label="FROM" value={shortAddress(e.source, 8, 6)} mono />
        <Row label="TO" value={shortAddress(e.target, 8, 6)} mono />
        <Row label="ASSET" value={e.assetSymbol ?? "—"} />
        <Row label="AMOUNT" value={`${compact(e.weight)} ${e.assetSymbol ?? "UNITS"}`} mono />
        <Row label="TRANSFERS" value={integer(e.transfers)} mono />
        <p className="label-s px-4 py-3 normal-case tracking-[0.02em] text-ink-faint">
          Amount is the sum of observed transfer amounts along this edge, in {e.assetSymbol ?? "this asset&rsquo;s"}{" "}
          units. Stroke weight encodes transfers, not amount, so edges in different assets stay comparable.
        </p>
      </div>
    );
  }

  const n = selection.node;
  const isAsset = n.kind === "asset";
  return (
    <div className="flex flex-col">
      <Head title={isAsset ? "ASSET" : n.role} onClose={onClose} />
      <div className="border-b border-rule-faint px-4 py-3">
        <p className="truncate font-mono text-data-l text-ink">{isAsset ? n.label : shortAddress(n.label, 10, 8)}</p>
        {isAsset ? <p className="label-s mt-1">{String(n.role).replace("_", " ")}</p> : null}
      </div>
      <Row label="VALUE OBSERVED" value={compact(n.weight)} mono />
      <Row label="TRANSFERS" value={integer(n.transfers)} mono />
      <Row label={isAsset ? "COUNTERPARTIES" : "ASSETS TOUCHED"} value={integer(n.degree)} mono />
      <div className="flex flex-col gap-px bg-rule">
        <Link
          href={n.href}
          className="label flex items-center justify-between bg-raised px-4 py-3 text-ink m-fast hover:bg-elevated"
        >
          {isAsset ? "OPEN ASSET PASSPORT" : "OPEN WALLET"}
          <span aria-hidden>→</span>
        </Link>
        <a
          href={`${CHAIN.explorer}/address/${isAsset ? n.contract : n.label}`}
          target="_blank"
          rel="noopener noreferrer"
          className="label flex items-center justify-between bg-raised px-4 py-3 text-ink-muted m-fast hover:text-ink"
        >
          VIEW ON BLOCKSCOUT
          <IconExternal size={12} />
        </a>
      </div>
    </div>
  );
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
      <span className="label text-ink">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close inspector"
        className="p-1 text-ink-faint m-fast hover:text-ink"
      >
        <IconClose size={13} />
      </button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5">
      <span className="label-s">{label}</span>
      <span className={`shrink-0 text-data-s text-ink ${mono ? "tabular font-mono" : "font-mono"}`}>{value}</span>
    </div>
  );
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
