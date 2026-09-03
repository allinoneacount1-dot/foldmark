"use client";

import { useState } from "react";
import Link from "next/link";
import { TopologyCanvas, type TopologySelection } from "@/components/graph/TopologyCanvas";
import type { MarketGraph } from "@/lib/graph";
import { compact, integer, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";
import { IconClose, IconExternal } from "@/components/icons";
import type { DataState } from "@/lib/data-state";
import { present } from "@/lib/presentation-state";

/**
 * The topology instrument: canvas plus inspector.
 *
 * Selection state lives here so the canvas stays a pure renderer. The inspector
 * docks as a third column on wide screens and as a bottom sheet on narrow ones,
 * which is the mobile adaptation the brief asks for — not a shrunken desktop.
 */
export function TopologyView({
  graph,
  className = "",
  emptyHint,
  state = "INDEXING",
}: {
  graph: MarketGraph;
  className?: string;
  emptyHint?: string;
  /**
   * The condition of the data this map would have been drawn from. It decides
   * which sentence the empty canvas says — a layer still initializing is not
   * the same statement as a window that was covered and held nothing.
   */
  state?: DataState;
}) {
  const [selected, setSelected] = useState<TopologySelection>(null);

  if (!graph.nodes.length) {
    return <TopologyPending state={state} detail={emptyHint} className={className} />;
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
           which is why the key is the selection, not the panel itself. */
        <div className="m-enter-rise absolute inset-x-0 bottom-0 z-20 border-t border-rule bg-raised lg:m-enter-slide lg:static lg:w-[17rem] lg:shrink-0 lg:border-t-0 lg:border-l">
          <div key={selectionKey(selected)} className="m-enter-fade">
            <Inspector selection={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- pending map */

/**
 * The canvas before there is anything to draw on it.
 *
 * THE RULE THIS COMPONENT IS BUILT AROUND: it draws no node, no edge, no label
 * belonging to a real thing, and no count. Everything on screen is either a
 * sentence about the state, the name of a category the layer will eventually
 * hold, or geometry that is deliberately regular — a ruled grid, a soft centre
 * guide, one scan. Regularity is the tell: a market never produces an evenly
 * spaced lattice, so nothing here can be misread as an observation.
 *
 * What it replaces was a left-aligned paragraph in a black rectangle, which
 * read as a surface that had failed rather than one that had not started.
 */

/** What the structure layer will contain, named — not counted, not drawn. */
const ARCHITECTURE = ["ASSETS", "WALLETS", "PROTOCOLS", "CAPITAL FLOWS"] as const;

/** The fields the inspector will hold once something exists to inspect. */
const INSPECTOR_FIELDS = ["ENTITY", "VALUE OBSERVED", "TRANSFERS", "COUNTERPARTIES"] as const;

function TopologyPending({
  state,
  detail,
  className = "",
}: {
  state: DataState;
  detail?: string;
  className?: string;
}) {
  const p = present(state, "topology");

  return (
    <div className={`relative flex min-h-[18rem] min-w-0 flex-1 ${className}`}>
      <style>{PENDING_CSS}</style>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-void">
        {/* Guide geometry. Decorative by construction and hidden from the
            accessibility tree: none of it carries a value. */}
        <div aria-hidden className="fm-topo-guide absolute inset-0" />
        <div aria-hidden className="fm-topo-halo absolute inset-0" />
        <div aria-hidden className="fm-topo-scan absolute inset-0" />

        {/* canvas shell head */}
        <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
          <span className="label-s text-ink-dim">TOPOLOGY CANVAS</span>
          <span className="label-s flex min-w-0 items-center gap-2 text-ink-faint">
            <span aria-hidden className="fm-topo-tick h-1 w-1 shrink-0 bg-ink-faint" />
            <span className="truncate">{p.label}</span>
          </span>
        </div>

        {/* the drawing field, marked but empty */}
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <CornerMarks />
          <p className="m-enter-unmask relative font-display text-[1.375rem] leading-tight tracking-[-0.02em] text-ink sm:text-[1.625rem]">
            {p.headline}
          </p>
          <p className="m-enter-fade relative max-w-[48ch] text-body-s text-ink-muted">{detail ?? p.detail}</p>
        </div>

        {/* what the layer will hold — named, never numbered */}
        <div className="relative shrink-0 border-t border-rule-faint px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="label-s text-ink-dim">ARCHITECTURE</span>
            <ul className="flex flex-wrap items-baseline">
              {ARCHITECTURE.map((term, i) => (
                <li key={term} className="label-s text-ink-faint">
                  {term}
                  {/* The separator trails its term, so a line that wraps starts
                      with a word rather than with a floating middot. */}
                  {i < ARCHITECTURE.length - 1 ? (
                    <span aria-hidden className="px-2">
                      ·
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* The inspector keeps its column so the instrument is not half a layout
          while it waits. It holds field names and dashes — the slots, with
          nothing asserted in them. */}
      <div className="relative hidden w-[17rem] shrink-0 flex-col border-l border-rule bg-raised lg:flex">
        <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
          <span className="label text-ink-dim">INSPECTOR</span>
        </div>
        <div className="border-b border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">NOTHING SELECTED</p>
          <p className="mt-2 text-body-s text-ink-muted">
            A node or an edge opens here once the map has one to select.
          </p>
        </div>
        {INSPECTOR_FIELDS.map((field) => (
          <div key={field} className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5">
            <span className="label-s">{field}</span>
            <span aria-hidden className="shrink-0 font-mono text-data-s text-ink-dim">
              &mdash;
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Registration marks around the drawing field. A drafting frame, not a card
 * border — and placed on the field itself rather than the whole region, so they
 * mark where the map will be drawn and never collide with the chrome.
 */
function CornerMarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-2 sm:inset-3">
      <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-rule-strong" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-rule-strong" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-rule-strong" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-rule-strong" />
    </div>
  );
}

/**
 * Motion here is one bounded event, not a loop: the grid resolves, one scan
 * crosses the field, and the surface goes still. A canvas that kept moving
 * would be animating an absence, and continuous movement beside a market map
 * is exactly the thing that could be mistaken for market movement.
 *
 * The global reduced-motion reset already collapses every animation to an
 * instant state change; these rules restate the intent locally so the scan is
 * removed outright rather than flashed.
 */
const PENDING_CSS = `
.fm-topo-guide {
  background-image:
    repeating-linear-gradient(to right, var(--color-rule-faint) 0 1px, transparent 1px 48px),
    repeating-linear-gradient(to bottom, var(--color-rule-faint) 0 1px, transparent 1px 48px);
  -webkit-mask-image: radial-gradient(130% 105% at 50% 50%, #000 30%, transparent 82%);
  mask-image: radial-gradient(130% 105% at 50% 50%, #000 30%, transparent 82%);
  animation: fm-topo-resolve 720ms var(--ease-out) both;
}

.fm-topo-halo {
  background-image: radial-gradient(58% 66% at 50% 52%, rgba(242, 240, 232, 0.045), transparent 72%);
  animation: fm-topo-resolve 720ms var(--ease-out) 80ms both;
}

.fm-topo-scan {
  background-image: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-signal) 12%, transparent),
    transparent
  );
  background-size: 140px 100%;
  background-repeat: no-repeat;
  background-position: -180px 0;
  animation: fm-topo-sweep 1600ms var(--ease-inout) 240ms both;
}

.fm-topo-tick {
  animation: fm-topo-blink 2600ms steps(1, end) infinite;
}

@keyframes fm-topo-resolve {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fm-topo-sweep {
  from { background-position: -180px 0; opacity: 1; }
  to { background-position: calc(100% + 180px) 0; opacity: 0; }
}

@keyframes fm-topo-blink {
  0%, 62% { opacity: 0.9; }
  63%, 100% { opacity: 0.25; }
}

@media (prefers-reduced-motion: reduce) {
  .fm-topo-guide,
  .fm-topo-halo { animation: none; opacity: 1; }
  .fm-topo-scan { display: none; }
  .fm-topo-tick { animation: none; opacity: 0.6; }
}
`;

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
