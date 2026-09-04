"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TopologyCanvas, type TopologySelection } from "@/components/graph/TopologyCanvas";
import type { MarketGraph } from "@/lib/graph";
import { compact, integer, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";
import { IconClose, IconExternal } from "@/components/icons";
import type { DataState } from "@/lib/data-state";
import { previewTopology, type PreviewNode, type PreviewNodeKind } from "@/lib/presentation-preview";
import { PreviewCanvas, type PreviewHit } from "@/components/graph/PreviewCanvas";

/**
 * The topology instrument: canvas plus inspector.
 *
 * Selection state lives here so the canvas stays a pure renderer. The inspector
 * docks as a third column on wide screens and as a bottom sheet on narrow ones,
 * which is the mobile adaptation the brief asks for — not a shrunken desktop.
 *
 * With nothing observed, the instrument does not go blank and apologise. It
 * draws the ARCHITECTURE PREVIEW: the same rings, the same shapes and the same
 * edge grammar, populated with categories instead of entities. A topology is a
 * picture of product STRUCTURE, and that structure is real whether or not a
 * particular market has been indexed yet. The moment a measured graph exists,
 * the preview is not consulted — real data always wins.
 */
export function TopologyView({
  graph,
  contracts = [],
  className = "",
}: {
  graph: MarketGraph;
  /**
   * The contracts registry, forwarded to the canvas so a node can be drawn as
   * what it is. Empty by default, which keeps every address an address.
   */
  contracts?: { address: string; contract_type: string | null }[];
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
        <TopologyCanvas graph={graph} contracts={contracts} selected={selected} onSelect={setSelected} />
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
   MEASUREMENT. Every node is a category — ASSET A, WALLET, MARKET,
   LIQUIDITY, PROTOCOL — and nothing on screen is denominated: no amount, no
   count, no percentage, no address, no symbol. Node radius comes from a
   structural weight and edge stroke from a structural intensity; neither is a
   quantity of anything, and neither is ever printed as text.

   The geometry comes from previewTopology(), which is pure, seeded and held by
   a test on the far side of every module that could turn a drawing into a
   published number.
   ========================================================================== */

/**
 * What each category IS, in the architecture.
 *
 * These describe a role in a structure, not a finding about a market. None of
 * them can be read as a quantity, an identity or an observation.
 */
const KIND_META: Record<PreviewNodeKind, { ring: string; type: string; role: string }> = {
  asset: { ring: "INNER", type: "ASSET", role: "TRADED INSTRUMENT" },
  market: { ring: "AROUND", type: "VENUE", role: "TRADING VENUE" },
  protocol: { ring: "AROUND", type: "PROTOCOL", role: "CONTRACT COUNTERPARTY" },
  wallet: { ring: "RIM", type: "WALLET", role: "HOLDER GROUPING" },
};

/** A category whose role is narrower than the default for its ring. */
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
  ["POSITION", "Assets inner · venues around · wallets on the rim"],
  ["SHAPE", "The class of counterparty a node belongs to"],
  ["ARROW", "The direction value moves along a relationship"],
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
        <Row label="INNER RING" value="ASSETS" />
        <Row label="AROUND" value="VENUES AND PROTOCOLS" />
        <Row label="RIM" value="WALLETS" />
        <p className="label-s px-4 py-3 normal-case tracking-[0.02em] text-ink-faint">
          The rings are product structure, so they are drawn before anything has been observed. Measured nodes take
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
        <p className="label-s mt-1">{m.ring} RING</p>
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

