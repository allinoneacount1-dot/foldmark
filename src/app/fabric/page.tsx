import type { Metadata } from "next";
import { TopologyView } from "@/components/graph/TopologyView";
import { RailColumn } from "@/components/layout/Frame";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { StateTag } from "@/components/ui/primitives";
import {
  CapitalFlowModule,
  NetworkActivityModule,
  TopFlowsModule,
  CapabilityRail,
} from "@/components/intelligence/rail";
import { getAssets, getWindowActivity, getContracts, foldEdges, requestNow, type WindowActivity,
} from "@/lib/queries";
import {
  FLOW_CLASSES,
  PROTOCOL_CATEGORIES,
  parseFlowClass,
  parseCategory,
  buildContractIndex,
  filterByFlowClass,
  filterByCategory,
  countByFlowClass,
  countByCategory,
} from "@/lib/flow-classification";
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
  searchParams: Promise<{ w?: string; type?: string; category?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";
  const typeFilter = (ASSET_TYPES as readonly string[]).includes(params.type ?? "") ? (params.type as AssetType) : null;

  /**
   * Filter state lives in the URL, so a view is shareable, survives a reload
   * and renders the same on the server. An unrecognised value parses to null
   * and reads as ALL: a stale query string must never produce an empty map
   * that looks like a measurement of nothing.
   */
  const categoryFilter = parseCategory(params.category);
  const flowFilter = parseFlowClass(params.flow);

  const now = await requestNow();
  const [assetsResult, activity, contractsResult] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getContracts(),
  ]);

  const assets = typeFilter ? assetsResult.rows.filter((a) => a.asset_type === typeFilter) : assetsResult.rows;
  const allowed = new Set(assets.map((a) => a.id));
  const byType = typeFilter ? activity.rows.filter((r) => r.asset_id && allowed.has(r.asset_id)) : activity.rows;

  /**
   * The map, the counters and the rail all read the SAME filtered transfers.
   *
   * A chip that redrew the canvas while the totals beside it stayed global
   * would be worse than a dead chip: a working control reporting a number that
   * does not describe what is on screen. Classification comes from the
   * contracts registry, so with no registry every transfer is UNCLASSIFIED and
   * the category chips select nothing — which is the honest outcome, not a
   * bug to paper over.
   */
  const contracts = buildContractIndex(contractsResult.rows);
  const classifiable = byType.map((r) => ({ ...r, from: r.from_address, to: r.to_address }));
  const flowCounts = countByFlowClass(classifiable, contracts);
  const categoryCounts = countByCategory(classifiable, contracts);
  const rows = filterByCategory(filterByFlowClass(classifiable, contracts, flowFilter), contracts, categoryFilter);

  // Recount against the filtered rows so the rail can never contradict the tape.
  const narrowed = typeFilter !== null || flowFilter !== null || categoryFilter !== null;
  const filtered: WindowActivity = narrowed ? recount(activity, rows, now) : activity;

  /**
   * Whether the rail has anything measured to report.
   *
   * Same test the dashboard uses: either transfers were observed, or the window
   * query genuinely answered. Anything else and the rail shows capabilities
   * rather than a stack of panels announcing they are waiting.
   */
  const railLive =
    filtered.transfers > 0 || (filtered.state !== "INDEXING" && filtered.state !== "UNAVAILABLE");

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

  /** Every control keeps the others, so filters compose instead of resetting. */
  const href = (
    next: Partial<{ w: string; type: string | undefined; category: string | undefined; flow: string | undefined }>,
  ) => {
    const sp = new URLSearchParams();
    sp.set("w", next.w ?? window);
    const t = "type" in next ? next.type : (typeFilter ?? undefined);
    if (t) sp.set("type", t);
    const c = "category" in next ? next.category : (categoryFilter ?? undefined);
    if (c) sp.set("category", c.toLowerCase());
    const f = "flow" in next ? next.flow : (flowFilter ?? undefined);
    if (f) sp.set("flow", f.toLowerCase());
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

          <ChipGroup label="Category">
            <ChipLink href={href({ category: undefined })} active={!categoryFilter} count={classifiable.length}>
              ALL
            </ChipLink>
            {PROTOCOL_CATEGORIES.map((c) => (
              <ChipLink
                key={c}
                // Clicking the active chip again clears it.
                href={href({ category: categoryFilter === c ? undefined : c })}
                active={categoryFilter === c}
                count={categoryCounts[c]}
              >
                {c}
              </ChipLink>
            ))}
          </ChipGroup>

          <ChipGroup label="Flow">
            <ChipLink href={href({ flow: undefined })} active={!flowFilter} count={classifiable.length}>
              ALL
            </ChipLink>
            {FLOW_CLASSES.map((c) => (
              <ChipLink
                key={c}
                href={href({ flow: flowFilter === c ? undefined : c })}
                active={flowFilter === c}
                count={flowCounts[c]}
              >
                {c}
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

          {/* A count is a measurement, so it appears only where one was taken.
              Where none was, the tape used to hold three em dashes — a row of
              gaps that reads as a broken instrument rather than an early one.
              It now carries the state chip alone, and the canvas below carries
              the structure. */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {counted ? (
              <p className="label-s text-ink-faint">
                {integer(graph.shown.nodes)} NODES · {integer(graph.shown.edges)} EDGES ·{" "}
                {integer(graph.totals.transfers)} TX
              </p>
            ) : null}
            {/*
              No state chip over the preview. The canvas carries its own
              ARCHITECTURE PREVIEW badge, and a second label saying the
              structure is initializing contradicted the structure already on
              screen. The chip returns only when a measured map is drawn and
              something about it is worth qualifying.
            */}
            {drawn && chipState !== "OK" ? <StateTag state={chipState} surface="topology" /> : null}
          </div>
        </div>
      </div>

      {/* instrument */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--width-rail)]">
        <div className="flex min-w-0 flex-col border-b border-rule lg:min-h-0 lg:border-b-0 lg:border-r">
          {/* /fabric is a full-screen instrument, so the map takes the height
              rather than sitting in a short band above empty ground. On a
              narrow viewport it is given a fixed, generous height; from lg it
              simply takes everything the row has left. */}
          {/*
            With an observed graph the canvas draws it. With none, the surface
            shows the composition the product reads markets in — sources left,
            assets through the middle, counterparties right — which is a fact
            about FOLDMARK rather than a claim about the chain.
          */}
          {/*
            The map is always the canvas. TopologyView draws the observed graph
            when there is one and its own spatial architecture preview when
            there is not — both pannable, hoverable and inspectable, because
            /fabric answers a spatial question either way. The card-based
            SOURCE-to-COUNTERPARTY diagram answers a directional one and lives
            on /flows.
          */}
          <div className="flex h-[28rem] min-h-0 shrink-0 sm:h-[34rem] lg:h-auto lg:flex-1">
            <TopologyView graph={graph} contracts={contractsResult.rows} state={topology} />
          </div>
          {/* The measured legend documents a measured encoding: radius as
              observed value, edge weight as value transferred, the ring as the
              newest indexed block. None of that is on screen while the canvas
              is drawing the architecture preview, and the preview carries its
              own legend for what it does draw — so this one appears only when
              there is a real map under it. */}
          {drawn ? <Legend graph={graph} window={window} state={topology} /> : null}
        </div>

        {/* The rail is a full-height column beside a full-height map, so
            whatever the three modules do not fill is still on screen. Painted
            in the rule tone it was a tall lighter rectangle with nothing in it;
            it is page ground now, and the space is closed by a foot that says
            what the rail reports and where it read it — true with or without a
            single indexed transfer, and carrying no figure of its own. */}
        <RailColumn
          revision={`${window}:${typeFilter ?? "all"}:${categoryFilter ?? "all"}:${flowFilter ?? "all"}`}
          className="lg:!static lg:max-h-none lg:overflow-visible lg:bg-void"
        >
          {/* flex-1 rather than a calc() against the viewport: the column is
              already stretched to the height of the instrument row, and a
              hand-computed height that misses by the height of a wrapped
              control row leaves a strip of the rail's own tone showing under
              it. */}
          <div className="flex flex-col gap-px overflow-y-auto bg-void lg:min-h-0 lg:flex-1">
            {/*
              With nothing measured, three stacked panels each saying they are
              waiting reads as three failures rather than one system without a
              database — and it sat beside a canvas already drawing the
              architecture. One capability rail says it once.
            */}
            {railLive ? (
              <>
                <CapitalFlowModule window={window} activity={filtered} edges={edges} assets={assets} />
                <NetworkActivityModule window={window} activity={filtered} />
                <TopFlowsModule edges={edges} assets={assets} window={window} state={filtered.state} />
              </>
            ) : (
              <CapabilityRail className="border-0" />
            )}
            <RailFoot window={window} typeFilter={typeFilter} measured={drawn} />
          </div>
        </RailColumn>
      </div>
    </div>
  );
}

/**
 * The foot of the rail.
 *
 * It absorbs whatever height the three modules leave, so the bottom of the
 * column is a designed region rather than an unexplained block of colour. What
 * it says is structural and therefore true on an empty index: which questions
 * this rail answers, that all three read the same window as the map beside
 * them, and where the reading comes from. It carries no measurement — there is
 * no number here to be right or wrong about.
 */
function RailFoot({
  window,
  typeFilter,
  measured,
}: {
  window: FlowWindow;
  typeFilter: AssetType | null;
  /** True when a measured graph is on screen. Decides what may be claimed. */
  measured: boolean;
}) {
  return (
    /* The outer box takes the leftover height and is page ground, so the space
       above the foot is the page rather than a painted panel. The foot itself
       hugs its own content at the bottom of the column. */
    <div className="flex flex-1 flex-col justify-end bg-void">
      <div className="flex flex-col gap-2 border border-rule bg-surface px-4 py-3.5">
        <p className="label-s text-ink-dim">THE RAIL</p>
        <ul className="flex flex-col gap-1">
          <Line term="CAPITAL FLOW" def="How much moved, and how fast" />
          <Line term="NETWORK ACTIVITY" def="How many addresses, assets and pairs were involved" />
          <Line term="TOP FLOWS" def="The strongest directed relationships, ranked" />
        </ul>
        {/*
          Provenance follows what is on screen. Crediting indexed Transfer logs
          while the canvas draws a generic architecture preview would attribute
          invented geometry to a measurement — the same error as printing an
          invented number, wearing a citation.
        */}
        {measured ? (
          <p className="label-s normal-case tracking-[0.02em] text-ink-faint">
            All three read the same {window} window as the map
            {typeFilter ? `, narrowed to ${ASSET_TYPE_LABEL[typeFilter]}` : ""}. Source: Robinhood Chain RPC, ERC-20
            Transfer logs indexed by FOLDMARK.
          </p>
        ) : (
          <p className="label-s normal-case tracking-[0.02em] text-ink-faint">
            SOURCE · PRODUCT ARCHITECTURE PREVIEW. No observed transfer data is used to draw it.
          </p>
        )}
      </div>
    </div>
  );
}

function Line({ term, def }: { term: string; def: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="label-s shrink-0 text-ink-muted">{term}</span>
      <span className="truncate text-body-s text-ink-faint">{def}</span>
    </li>
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
 * It is rendered only over a drawn map. Every line below either counts what is
 * on screen or names an encoding that is actually in force, and both of those
 * require a measured graph to be true.
 */
function Legend({
  graph,
  window,
  state,
}: {
  graph: ReturnType<typeof buildMarketGraph>;
  window: FlowWindow;
  state: DataState;
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
          def={`${sources} sources left · ${assets} assets centre · ${destinations} destinations right`}
        />
        <Item term="RADIUS" def="Square root of observed value moved" />
        <Item term="EDGE WEIGHT" def="Value transferred along that relationship" />
        <Item
          term="RING"
          def={
            fresh
              ? `${fresh} node${fresh === 1 ? "" : "s"} active in the newest indexed block`
              : "No node active in the newest block"
          }
        />
        {/* The window says its condition in the reader's terms; the machine
            word for it stays in the API and in /docs. */}
        <Item term="WINDOW" def={`${window} · ${presentLabel(state, "topology")}`} />
        {graph.truncated ? (
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
