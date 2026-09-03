import type { Metadata } from "next";
import { TopologyView } from "@/components/graph/TopologyView";
import { RailColumn } from "@/components/layout/Frame";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { StateTag } from "@/components/ui/primitives";
import { CapitalFlowModule, NetworkActivityModule, TopFlowsModule } from "@/components/intelligence/rail";
import { getAssets, getWindowActivity, foldEdges, requestNow, type WindowActivity,
} from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { integer } from "@/lib/format";
import type { DataState } from "@/lib/data-state";
import { presentLabel } from "@/lib/presentation-state";
import { ASSET_TYPE_LABEL, ASSET_TYPES, WINDOWS, CHAIN, type AssetType, type FlowWindow } from "@/config/site";

export const metadata: Metadata = {
  title: "Market topology",
  description: "The Robinhood Chain market as a graph: sources, assets and destinations connected by observed capital movement.",
};

export const revalidate = 30;

/**
 * The topology is an instrument, not an article: it fills the viewport below
 * the header and the page itself does not scroll. Filters are links, so a view
 * is shareable, survives reload and works without JavaScript.
 */
export default async function FabricPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; type?: string }>;
}) {
  const params = await searchParams;
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";
  const typeFilter = (ASSET_TYPES as readonly string[]).includes(params.type ?? "") ? (params.type as AssetType) : null;

  const now = await requestNow();
  const [assetsResult, activity] = await Promise.all([getAssets(), getWindowActivity(window, now)]);

  const assets = typeFilter ? assetsResult.rows.filter((a) => a.asset_type === typeFilter) : assetsResult.rows;
  const allowed = new Set(assets.map((a) => a.id));
  const rows = typeFilter ? activity.rows.filter((r) => r.asset_id && allowed.has(r.asset_id)) : activity.rows;

  // Recount against the filtered rows so the rail can never contradict the tape.
  const filtered: WindowActivity = typeFilter ? recount(activity, rows, now) : activity;

  const graph = buildMarketGraph(rows, assets, { limitAddresses: 12, limitAssets: 10 });
  const edges = foldEdges(rows, assets, 10);

  // The map is drawn from observed transfers, so the transfer state is the one
  // the canvas, the legend and the tape all speak.
  const topology: DataState = filtered.state;
  const drawn = graph.nodes.length > 0;
  /**
   * Whether the counters are entitled to show a number.
   *
   * A count is a measurement. "0 NODES" says we looked at the chain and found
   * nothing, which is a claim an index that was never queried cannot make — so
   * an unobserved window gets an em dash in the slot instead of a zero.
   */
  const counted = topology !== "UNAVAILABLE" && topology !== "INDEXING";
  /**
   * The chip tone. UNAVAILABLE renders in the negative colour and reads as a
   * failure, while to a reader it says exactly what INDEXING says: not observed
   * yet. The chip therefore shows the pending state. Nothing downstream of this
   * changes — the API, /docs and every internal decision still see UNAVAILABLE.
   */
  const chipState: DataState = topology === "UNAVAILABLE" ? "INDEXING" : topology;

  const href = (next: Partial<{ w: string; type: string | undefined }>) => {
    const sp = new URLSearchParams();
    sp.set("w", next.w ?? window);
    const t = "type" in next ? next.type : (typeFilter ?? undefined);
    if (t) sp.set("type", t);
    return `/fabric?${sp.toString()}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-var(--nav-height))]">
      {/* control tape */}
      <div className="shrink-0 border-b border-rule bg-surface">
        <div className="shell flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="label text-ink">MARKET TOPOLOGY</h1>
            <span className="label-s text-ink-faint">CHAIN {CHAIN.id}</span>
          </div>

          <ChipGroup label="Asset type">
            <ChipLink href={href({ type: undefined })} active={!typeFilter}>
              ALL
            </ChipLink>
            {ASSET_TYPES.map((t) => (
              <ChipLink key={t} href={href({ type: t })} active={typeFilter === t}>
                {ASSET_TYPE_LABEL[t]}
              </ChipLink>
            ))}
          </ChipGroup>

          <ChipGroup label="Window">
            {WINDOWS.map((w) => (
              <ChipLink key={w} href={href({ w })} active={w === window}>
                {w}
              </ChipLink>
            ))}
          </ChipGroup>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <p className="label-s text-ink-faint">
              {counted ? (
                <>
                  {integer(graph.shown.nodes)} NODES · {integer(graph.shown.edges)} EDGES ·{" "}
                  {integer(graph.totals.transfers)} TX
                </>
              ) : (
                <>
                  <Absent /> NODES · <Absent /> EDGES · <Absent /> TX
                </>
              )}
            </p>
            {counted ? null : <StateTag state={chipState} surface="topology" />}
          </div>
        </div>
      </div>

      {/* instrument */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--width-rail)]">
        <div className="flex min-w-0 flex-col border-b border-rule lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex h-[24rem] min-h-0 shrink-0 sm:h-[30rem] lg:h-auto lg:flex-1">
            <TopologyView
              graph={graph}
              state={topology}
              emptyHint={
                // Only claim an observed absence when the window was actually
                // covered. Otherwise the canvas says what the surface says.
                counted
                  ? typeFilter
                    ? `No ${ASSET_TYPE_LABEL[typeFilter]} transfer was observed in the ${window} window. Widen the window or clear the filter.`
                    : `No transfer was observed in the ${window} window. The map draws itself as soon as value moves.`
                  : undefined
              }
            />
          </div>
          <Legend graph={graph} window={window} state={topology} drawn={drawn} />
        </div>

        <RailColumn revision={`${window}:${typeFilter ?? "all"}`} className="lg:!static lg:max-h-none lg:overflow-visible">
          <div className="flex flex-col gap-px overflow-y-auto bg-rule lg:h-[calc(100dvh-var(--nav-height)-3.25rem)]">
            <CapitalFlowModule window={window} activity={filtered} edges={edges} assets={assets} />
            <NetworkActivityModule window={window} activity={filtered} />
            <TopFlowsModule edges={edges} assets={assets} window={window} state={filtered.state} />
          </div>
        </RailColumn>
      </div>
    </div>
  );
}

/**
 * The slot where a count would be.
 *
 * An em dash, not a zero and not a faint number. It holds the shape of the tape
 * so the layout reads finished, and asserts nothing.
 */
function Absent() {
  return (
    <span aria-hidden className="text-ink-dim">
      &mdash;
    </span>
  );
}

/** Re-fold a window down to a filtered subset of its rows. */
function recount(base: WindowActivity, rows: WindowActivity["rows"], now: number): WindowActivity {
  const addresses = new Set<string>();
  const assets = new Set<string>();
  const pairs = new Set<string>();
  const buckets = new Array<number>(base.buckets.length).fill(0);
  const span = base.bucketMinutes * 60000 * base.buckets.length;
  const start = now - span;

  for (const r of rows) {
    addresses.add(r.from_address);
    addresses.add(r.to_address);
    if (r.asset_id) assets.add(r.asset_id);
    pairs.add(r.from_address + ">" + r.to_address);
    const t = new Date(r.timestamp).getTime();
    const i = Math.min(buckets.length - 1, Math.max(0, Math.floor(((t - start) / span) * buckets.length)));
    buckets[i] += 1;
  }

  return {
    ...base,
    rows,
    transfers: rows.length,
    activeAddresses: addresses.size,
    activeAssets: assets.size,
    uniquePairs: pairs.size,
    buckets,
    // A filter that removes every row is a genuine EMPTY — but only when there
    // was something to filter. If the base window was never observed, the
    // filtered view is just as unobserved, and calling it EMPTY would claim we
    // looked and found nothing.
    state: rows.length ? base.state : observed(base.state) ? "EMPTY" : base.state,
  };
}

/** True when the state means the index actually answered. */
function observed(state: DataState): boolean {
  return state === "OK" || state === "PARTIAL" || state === "STALE" || state === "EMPTY";
}

/**
 * The legend is generated from the graph it describes, so it cannot document an
 * encoding the renderer does not implement.
 *
 * With nothing drawn it keeps its place and documents the encoding in the
 * abstract — position, radius, edge weight and ring are properties of the
 * renderer, true before a single node exists. What it drops in that state is
 * every count, because a count is a measurement and there is none.
 */
function Legend({
  graph,
  window,
  state,
  drawn,
}: {
  graph: ReturnType<typeof buildMarketGraph>;
  window: FlowWindow;
  state: DataState;
  drawn: boolean;
}) {
  const assets = graph.nodes.filter((n) => n.kind === "asset").length;
  const sources = graph.nodes.filter((n) => n.kind === "source").length;
  const destinations = graph.nodes.filter((n) => n.kind === "destination").length;
  const fresh = graph.nodes.filter((n) => n.fresh).length;

  return (
    <div className="shrink-0 border-t border-rule bg-void">
      <dl className="shell grid grid-cols-2 gap-x-6 gap-y-1.5 py-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
        <Item
          term="POSITION"
          def={
            drawn
              ? `${sources} sources left · ${assets} assets centre · ${destinations} destinations right`
              : "Sources left · assets centre · destinations right"
          }
        />
        <Item term="RADIUS" def="Square root of observed value moved" />
        <Item term="EDGE WEIGHT" def="Value transferred along that relationship" />
        <Item
          term="RING"
          def={
            drawn
              ? fresh
                ? `${fresh} node${fresh === 1 ? "" : "s"} active in the newest indexed block`
                : "No node active in the newest block"
              : "Active in the newest indexed block"
          }
        />
        {/* The window says its condition in the reader's terms; the machine
            word for it stays in the API and in /docs. */}
        <Item term="WINDOW" def={`${window} · ${presentLabel(state, "topology")}`} />
        {drawn && graph.truncated ? (
          <Item term="SHOWN" def={`${graph.shown.nodes} of ${graph.totals.addresses + graph.totals.assets} — ranked by value`} />
        ) : null}
      </dl>
    </div>
  );
}

function Item({ term, def }: { term: string; def: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <dt className="label-s shrink-0">{term}</dt>
      <dd className="text-body-s text-ink-faint">{def}</dd>
    </div>
  );
}
