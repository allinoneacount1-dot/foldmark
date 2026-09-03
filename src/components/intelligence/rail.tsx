import Link from "next/link";
import { Panel, PanelHeader, EmptyState, CoverageNote } from "@/components/ui/primitives";
import { Histogram, Sparkline, MagnitudeRow, FlowBar } from "@/components/charts";
import { compact, integer, shortAddress, signed } from "@/lib/format";
import type { DataState } from "@/lib/data-state";
import type { AssetRow, FlowEdge, StructureChange, WindowActivity } from "@/lib/queries";
import type { FlowWindow } from "@/config/site";

/**
 * The intelligence rail.
 *
 * Compact modules that sit beside the chart and the topology. Each module owns
 * one question, states its own data condition, and renders a state rather than
 * a number when the pipeline has nothing to report.
 *
 * Every module declares the SURFACE it holds — flow, activity, structure — so
 * the same absent value is said in that module's own terms instead of one
 * generic sentence repeated down the whole column.
 */

/**
 * The state a module shows when it has nothing to render.
 *
 * EMPTY survives, because EMPTY is a measurement: the index covered the window
 * and found nothing inside it, which is a finding rather than a fault. Every
 * other state with no rows behind it is a surface still waiting, and INDEXING
 * is how that is said to a reader — UNAVAILABLE is a fact about our storage, it
 * renders in the negative tone, and it answers a question about infrastructure
 * that nobody reading a market panel asked.
 *
 * This changes the word and the colour. It never changes a value, because there
 * is no value: the machine vocabulary is untouched and the API still returns
 * UNAVAILABLE to anything that reads it.
 */
/**
 * The state a rail module should show.
 *
 * With rows present the state passes through untouched. With none, the question
 * is whether the absence was measured. EMPTY, PARTIAL and STALE all mean the
 * query answered — the index looked and found nothing in what it covers — so
 * they are preserved. Collapsing PARTIAL into INDEXING would turn a measured
 * "nothing here, over a shorter window than you asked for" into "we have not
 * looked yet", which is a different and weaker claim than the one we can make.
 */
function railState(state: DataState, has: boolean): DataState {
  if (has) return state;
  if (state === "EMPTY" || state === "PARTIAL" || state === "STALE") return state;
  return "INDEXING";
}

/* ------------------------------------------------------------ capital flow */

export function CapitalFlowModule({
  window,
  activity,
  edges,
  assets,
}: {
  window: FlowWindow;
  activity: WindowActivity;
  edges: FlowEdge[];
  assets: AssetRow[];
}) {
  const symbols = new Map(assets.map((a) => [a.id, a.symbol]));
  // Assets on the edges, not amounts added together: this module spans assets.
  const assetsMoving = new Set(edges.map((e) => e.assetId).filter(Boolean)).size;
  const hasFlow = activity.transfers > 0;
  const state = railState(activity.state, hasFlow);

  return (
    <Panel>
      <PanelHeader title="CAPITAL FLOW" meta={window} state={state} surface="flow" />
      {hasFlow ? (
        <>
          <div className="grid grid-cols-2 gap-px bg-rule">
            <div className="bg-surface px-4 py-3">
              <p className="label-s">ASSETS MOVING</p>
              <p className="tabular mt-1 font-mono text-data-l text-ink">{integer(assetsMoving)}</p>
              <p className="label-s mt-0.5 text-ink-faint">ON OBSERVED EDGES</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="label-s">TRANSFERS</p>
              <p className="tabular mt-1 font-mono text-data-l text-ink">{integer(activity.transfers)}</p>
              <p className="label-s mt-0.5 text-ink-faint">{window} WINDOW</p>
            </div>
          </div>
          <div className="border-t border-rule px-4 py-3">
            <p className="label-s mb-2">TRANSFER RATE</p>
            <Sparkline series={activity.buckets} tone="signal" label={`Transfer rate over the ${window} window`} />
            <p className="label-s mt-1.5 text-ink-faint">
              {activity.buckets.length} INTERVALS · {activity.bucketMinutes}M EACH
            </p>
          </div>
          <div className="border-t border-rule px-4 py-2.5">
            <p className="label-s">
              TOP RELATIONSHIP{" "}
              <span className="text-ink-muted">
                {edges[0] ? `${compact(edges[0].amount)} ${symbols.get(edges[0].assetId ?? "") ?? ""}` : "—"}
              </span>
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          state={state}
          surface="flow"
          detail={
            state === "EMPTY"
              ? `The index covers the ${window} window and recorded no transfer inside it.`
              : undefined
          }
        />
      )}
    </Panel>
  );
}

/* -------------------------------------------------------- network activity */

export function NetworkActivityModule({ window, activity }: { window: FlowWindow; activity: WindowActivity }) {
  const has = activity.transfers > 0;
  const state = railState(activity.state, has);
  return (
    <Panel>
      <PanelHeader title="NETWORK ACTIVITY" meta={window} state={state} surface="activity" />
      {has ? (
        <>
          <div className="grid grid-cols-3 gap-px bg-rule">
            {[
              ["ADDRESSES", integer(activity.activeAddresses)],
              ["ASSETS", integer(activity.activeAssets)],
              ["PAIRS", integer(activity.uniquePairs)],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-3">
                <p className="label-s truncate">{k}</p>
                <p className="tabular mt-1 font-mono text-data text-ink">{v}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-rule px-4 py-3">
            <Histogram
              buckets={activity.buckets}
              label={`Transfers per interval across the ${window} window`}
              bucketMinutes={activity.bucketMinutes}
            />
            <p className="label-s mt-2 text-ink-faint">TRANSFERS PER {activity.bucketMinutes}M INTERVAL</p>
          </div>
          {activity.capped ? (
            <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
              Row cap reached — counts are a lower bound for this window.
            </p>
          ) : null}
          {/* Says so when the index does not reach as far back as the label claims. */}
          <CoverageNote note={activity.coverageNote} />
        </>
      ) : (
        <EmptyState
          state={state}
          surface="activity"
          detail="Active addresses, assets and counterparty pairs appear here once transfers are observed."
        />
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- flows */

export function TopFlowsModule({
  edges,
  assets,
  window,
  state,
}: {
  edges: FlowEdge[];
  assets: AssetRow[];
  window: FlowWindow;
  state: DataState;
}) {
  const symbols = new Map(assets.map((a) => [a.id, a.symbol]));
  const max = edges[0]?.amount ?? 1;
  // This module ranks relationships between addresses, which is the structure
  // layer seen as a ledger rather than as a map — so it speaks the topology
  // surface, and says the same thing the canvas says on /fabric.
  const shown = railState(state, edges.length > 0);

  return (
    <Panel>
      <PanelHeader title="TOP FLOWS" meta={window} state={shown} surface="topology" />
      {edges.length ? (
        <div className="px-4 py-2">
          {edges.slice(0, 6).map((e) => (
            <MagnitudeRow
              key={`${e.from}-${e.to}-${e.assetId}`}
              label={`${shortAddress(e.from, 6, 4)} → ${shortAddress(e.to, 6, 4)}`}
              value={`${compact(e.amount)} ${symbols.get(e.assetId ?? "") ?? ""}`}
              fraction={e.amount / max}
              tone="signal"
              meta={`${integer(e.transfers)} TX · BLOCK ${integer(e.lastBlock)}`}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          state={shown}
          surface="topology"
          detail="Directed value edges appear here once the indexer records transfers between addresses."
        />
      )}
    </Panel>
  );
}

/* -------------------------------------------------- structure (defined!) */

/**
 * STRUCTURE CHANGE has an explicit definition, which is why it is allowed to
 * exist: the number of directed address pairs observed in this window that were
 * not observed in the immediately preceding window of equal length. It measures
 * how much the shape of the market changed, not a mysterious score.
 */
export function StructureChangeModule({ change, window }: { change: StructureChange; window: FlowWindow }) {
  const known = change.currentPairs > 0 || change.previousPairs > 0;
  const state = railState(change.state, known);
  return (
    <Panel>
      <PanelHeader title="STRUCTURE CHANGE" meta={window} state={state} surface="topology" />
      {known ? (
        <>
          <div className="grid grid-cols-2 gap-px bg-rule">
            <div className="bg-surface px-4 py-3">
              <p className="label-s">NEW RELATIONSHIPS</p>
              <p className="tabular mt-1 font-mono text-data-l text-signal">{signed(change.newRelationships, 0)}</p>
            </div>
            <div className="bg-surface px-4 py-3">
              <p className="label-s">NOT REPEATED</p>
              <p className="tabular mt-1 font-mono text-data-l text-ink-muted">{integer(change.retiredRelationships)}</p>
            </div>
          </div>
          <div className="border-t border-rule px-4 py-3">
            <FlowBar
              inflow={change.newRelationships}
              outflow={change.retiredRelationships}
              scale={Math.max(change.newRelationships, change.retiredRelationships, 1)}
            />
            <p className="label-s mt-2 normal-case tracking-[0.02em] text-ink-faint">
              {integer(change.currentPairs)} directed pairs this window against {integer(change.previousPairs)} in the
              preceding {window}.
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          state={state}
          surface="topology"
          title="Structure not yet comparable"
          detail="Two consecutive windows of observed transfers are required before structural change can be measured."
        />
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- events */

export function EventLedger({
  rows,
  assets,
  state,
  now,
}: {
  rows: { tx_hash: string; log_index: number; block_number: number; asset_id: string | null; from_address: string; to_address: string; amount: string; timestamp: string }[];
  assets: AssetRow[];
  state: DataState;
  now: number;
}) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const shown = railState(state, rows.length > 0);
  return (
    <Panel>
      <PanelHeader title="NETWORK EVENTS" meta="MOST RECENT" state={shown} surface="activity" />
      {rows.length ? (
        <ol className="max-h-[320px] overflow-y-auto">
          {rows.slice(0, 24).map((r) => {
            const asset = byId.get(r.asset_id ?? "");
            return (
              <li
                key={`${r.tx_hash}-${r.log_index}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-rule-faint px-4 py-2 last:border-b-0"
              >
                <span className="label-s text-ink-faint">TRANSFER</span>
                <span className="truncate font-mono text-data-s text-ink-muted">
                  {shortAddress(r.from_address, 5, 3)} → {shortAddress(r.to_address, 5, 3)}
                </span>
                <span className="tabular shrink-0 font-mono text-data-s text-ink">
                  {asset ? `${compactAmount(r.amount, asset.decimals)} ${asset.symbol}` : `BLOCK ${integer(r.block_number)}`}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          state={shown}
          surface="activity"
          title="No events indexed"
          detail="The ledger fills as the indexer commits blocks."
        />
      )}
      <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">
        SOURCE ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS
      </p>
      <span className="sr-only">{`Ledger rendered at ${new Date(now).toISOString()}`}</span>
    </Panel>
  );
}

function compactAmount(amount: string, decimals: number): string {
  const n = Number(amount) / Math.pow(10, decimals);
  return Number.isFinite(n) ? compact(n) : "—";
}

/* -------------------------------------------------------------- shortcuts */

export function RailLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="label flex items-center justify-between border border-rule px-4 py-3 text-ink-muted m-fast hover:border-rule-strong hover:text-ink"
    >
      {label}
      <span aria-hidden>→</span>
    </Link>
  );
}
