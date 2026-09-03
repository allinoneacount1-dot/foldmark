"use client";

import { useState } from "react";
import Link from "next/link";
import { TopologyCanvas, type TopologySelection } from "@/components/graph/TopologyCanvas";
import type { MarketGraph } from "@/lib/graph";
import { compact, integer, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";
import { IconClose, IconExternal } from "@/components/icons";

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
}: {
  graph: MarketGraph;
  className?: string;
  emptyHint?: string;
}) {
  const [selected, setSelected] = useState<TopologySelection>(null);

  if (!graph.nodes.length) {
    return (
      <div className={`flex min-h-[18rem] flex-col items-start justify-center gap-2 p-6 ${className}`}>
        <p className="label-s text-ink-faint">NO TOPOLOGY TO DRAW</p>
        <p className="font-display text-[1.25rem] text-ink">No observed relationships in this window</p>
        <p className="measure text-body-s text-ink-muted">
          {emptyHint ??
            "Nodes and edges are built from indexed Transfer logs. Nothing is drawn until value actually moves between addresses."}
        </p>
      </div>
    );
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
