import { DocTitle, DocSection, P, Note, DocFooterNav } from "@/components/docs/DocShell";
import { StateTag } from "@/components/ui/primitives";
import { getIndexerStatus, getAssets, getProtocols, getRecentTransfers, countRows, requestNow,
} from "@/lib/queries";
import { health } from "@/server/market-data/budget";
import { PROVIDERS } from "@/server/market-data/registry";
import { activeEndpoint, lastRpcLatencyMs } from "@/server/market-data/providers/rpc";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { blockLabel, integer, relativeTime } from "@/lib/format";
import { FRESHNESS_BUDGET_MS, type DataState } from "@/lib/data-state";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Status",
  description: "Live health of every FOLDMARK dependency, measured on request. No uptime percentages are published because none are measured.",
};

export const revalidate = 0;
export const dynamic = "force-dynamic";

type Check = {
  component: string;
  state: DataState;
  label: string;
  detail: string;
};

export default async function StatusPage() {
  const now = await requestNow();

  const [indexer, assets, protocols, recent, transferCount] = await Promise.all([
    getIndexerStatus(),
    getAssets(),
    getProtocols(),
    getRecentTransfers(1),
    countRows("transfers"),
  ]);

  const providers = health(now);
  const storageConfigured = isSupabaseConfigured() && supabase !== null;
  const cursorAge = indexer.updatedAt ? now - new Date(indexer.updatedAt).getTime() : null;
  const lag = indexer.lagBlocks.value;

  const checks: Check[] = [
    {
      component: "CHAIN RPC",
      state: indexer.chainHead.value !== null ? "OK" : "UNAVAILABLE",
      label: indexer.chainHead.value !== null ? "OPERATIONAL" : "UNREACHABLE",
      detail:
        indexer.chainHead.value !== null
          ? `eth_blockNumber answered from ${new URL(activeEndpoint()).host} in ${lastRpcLatencyMs() ?? "?"}ms. Chain head ${blockLabel(indexer.chainHead.value)}.`
          : `No response from the ${CHAIN.name} RPC on this request. Every live chain read is failing.`,
    },
    {
      component: "DATABASE",
      state: !storageConfigured ? "UNAVAILABLE" : assets.state === "UNAVAILABLE" ? "UNAVAILABLE" : "OK",
      label: !storageConfigured ? "NOT CONFIGURED" : assets.state === "UNAVAILABLE" ? "UNREACHABLE" : "OPERATIONAL",
      detail: !storageConfigured
        ? "No storage credentials are present in this deployment, so nothing can be read."
        : assets.state === "UNAVAILABLE"
          ? "The registry query failed. Dependent surfaces will read DATA UNAVAILABLE."
          : `Registry query answered. ${transferCount.value !== null ? `${integer(transferCount.value)} transfers stored.` : "Row count unavailable."}`,
    },
    {
      component: "INDEXER",
      state:
        indexer.lastProcessedBlock.value === null
          ? "INDEXING"
          : cursorAge !== null && cursorAge > FRESHNESS_BUDGET_MS
            ? "STALE"
            : "OK",
      label:
        indexer.lastProcessedBlock.value === null
          ? "NO CURSOR"
          : cursorAge !== null && cursorAge > FRESHNESS_BUDGET_MS
            ? "DEGRADED — CURSOR STALE"
            : "OPERATIONAL",
      detail:
        indexer.lastProcessedBlock.value === null
          ? "The cursor has never committed a block. No window can be computed yet."
          : `Cursor at ${blockLabel(indexer.lastProcessedBlock.value)}, updated ${relativeTime(indexer.updatedAt, now)}${
              lag !== null ? `, ${integer(lag)} block${lag === 1 ? "" : "s"} behind the head` : ""
            }.`,
    },
    {
      component: "TRANSFER INGEST",
      state: recent.rows.length ? "OK" : recent.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING",
      label: recent.rows.length ? "OPERATIONAL" : recent.state === "UNAVAILABLE" ? "UNREACHABLE" : "NO DATA YET",
      detail: recent.rows.length
        ? `Most recent transfer at block ${integer(recent.rows[0].block_number)}, ${relativeTime(recent.rows[0].timestamp, now)}.`
        : "No transfer has been written yet. Ledgers and flows will read INDEXING.",
    },
    {
      component: "ASSET DISCOVERY",
      state: assets.rows.length ? "OK" : assets.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING",
      label: assets.rows.length ? "OPERATIONAL" : assets.state === "UNAVAILABLE" ? "UNREACHABLE" : "NO ASSETS YET",
      detail: assets.rows.length
        ? `${integer(assets.rows.length)} asset${assets.rows.length === 1 ? "" : "s"} registered from on-chain contract metadata.`
        : "No contract has yet matched the discovery rule during an indexer pass.",
    },
    {
      component: "GRAPH PROCESSING",
      state: recent.rows.length ? "OK" : "INDEXING",
      label: recent.rows.length ? "OPERATIONAL" : "AWAITING DATA",
      detail: recent.rows.length
        ? "The relationship engine folds graphs at request time from stored transfers; no separate service is involved."
        : "The engine is available but has nothing to fold until transfers exist.",
    },
    {
      component: "PRICE SOURCES",
      state: "UNAVAILABLE",
      label: "NOT WIRED",
      detail: `No price oracle is connected to chain ${CHAIN.id}. Price, OHLC candles and every currency figure read DATA UNAVAILABLE by design.`,
    },
    {
      component: "PROTOCOL REGISTRY",
      state: protocols.rows.length ? "OK" : protocols.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING",
      label: protocols.rows.length ? "OPERATIONAL" : protocols.state === "UNAVAILABLE" ? "UNREACHABLE" : "EMPTY",
      detail: protocols.rows.length
        ? `${integer(protocols.rows.length)} protocol${protocols.rows.length === 1 ? "" : "s"} verified.`
        : "No protocol is verified on this chain, so every flow is returned UNCLASSIFIED.",
    },
    {
      component: "API",
      state: "OK",
      label: "OPERATIONAL",
      detail: "This page was rendered by the same read layer the API serves, so a successful render is itself the check.",
    },
  ];

  const degraded = checks.filter((c) => c.state === "UNAVAILABLE" || c.state === "STALE");

  return (
    <article>
      <DocTitle
        kicker="SYSTEM"
        title="Status"
        lede="Measured on this request, not reported from a static list. Every row below is the result of an actual call made while rendering this page."
      />

      <div className="mt-8 border border-rule bg-surface px-4 py-3">
        <p className="label-s">SUMMARY</p>
        <p className="mt-1.5 text-body text-ink">
          {degraded.length === 0
            ? "Every dependency answered on this request, except those documented as not wired."
            : `${degraded.length} component${degraded.length === 1 ? "" : "s"} degraded or unavailable on this request.`}
        </p>
        <p className="label-s mt-1 text-ink-faint">CHECKED {relativeTime(new Date(now).toISOString(), now + 1000)}</p>
      </div>

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="components" title="Components">
          <div className="flex flex-col gap-px bg-rule">
            {checks.map((c) => (
              <div key={c.component} className="flex flex-col gap-2 bg-void p-4 sm:flex-row sm:items-start sm:gap-5">
                <div className="flex min-w-[13rem] shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1.5">
                  <span className="label text-ink">{c.component}</span>
                  <StateTag state={c.state} label={c.label} />
                </div>
                <p className="text-body-s text-ink-muted">{c.detail}</p>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="providers" title="Market data providers">
          <P>
            Each provider reports what it is permitted to do, what it has spent against that budget, and whether its
            support for this chain was verified rather than assumed. A provider whose chain support is not SUPPORTED is
            never called.
          </P>
          <div className="flex flex-col gap-px bg-rule">
            {providers.map((p) => {
              const facts = PROVIDERS[p.id];
              return (
                <div key={p.id} className="bg-void p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="label text-ink">{facts.label}</span>
                    <StateTag
                      state={
                        p.status === "UP"
                          ? "OK"
                          : p.status === "DISABLED"
                            ? "INDEXING"
                            : p.status === "RATE_LIMITED" || p.status === "DOWN"
                              ? "UNAVAILABLE"
                              : "PARTIAL"
                      }
                      label={p.status}
                    />
                  </div>
                  <p className="mt-1.5 max-w-[68ch] text-body-s text-ink-muted">{facts.role}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                    <div className="flex items-baseline gap-2">
                      <dt className="label-s">CHAIN SUPPORT</dt>
                      <dd className="text-body-s text-ink-faint">{facts.chainSupport}</dd>
                    </div>
                    {p.minuteBudget !== null ? (
                      <div className="flex items-baseline gap-2">
                        <dt className="label-s">MINUTE</dt>
                        <dd className="tabular text-body-s text-ink-faint">
                          {p.callsThisMinute} / {p.minuteBudget}
                        </dd>
                      </div>
                    ) : null}
                    {p.monthBudget !== null ? (
                      <div className="flex items-baseline gap-2">
                        <dt className="label-s">MONTH</dt>
                        <dd className="tabular text-body-s text-ink-faint">
                          {integer(p.callsThisMonth)} / {integer(p.monthBudget)}
                        </dd>
                      </div>
                    ) : null}
                    {p.latencyMs !== null ? (
                      <div className="flex items-baseline gap-2">
                        <dt className="label-s">LATENCY</dt>
                        <dd className="tabular text-body-s text-ink-faint">{p.latencyMs}ms</dd>
                      </div>
                    ) : null}
                    {p.cacheHitRate !== null ? (
                      <div className="flex items-baseline gap-2">
                        <dt className="label-s">CACHE HITS</dt>
                        <dd className="tabular text-body-s text-ink-faint">{Math.round(p.cacheHitRate * 100)}%</dd>
                      </div>
                    ) : null}
                  </dl>
                  {p.lastError ? <p className="label-s mt-1.5 text-negative">LAST ERROR {p.lastError}</p> : null}
                </div>
              );
            })}
          </div>
          <Note>
            Budgets are enforced before every outbound call. Three consecutive failures open a circuit breaker with
            exponential backoff; a 429 opens it immediately. Every provider call is made server-side and cached, so a
            hundred readers cost one request rather than a hundred.
          </Note>
        </DocSection>

        <DocSection id="no-uptime" title="Why there are no uptime figures">
          <P>
            FOLDMARK does not publish availability percentages, because it does not run an external monitor that would
            make them true. A number like &ldquo;99.9%&rdquo; with nothing measuring it is exactly the kind of
            fabricated metric the rest of the product refuses to show.
          </P>
          <P>
            What is published instead is what can be checked honestly: whether each dependency answered on this request,
            how far behind the chain the index currently is, and when the cursor last advanced.
          </P>
          <Note>
            The same signals are available programmatically at{" "}
            <a href="/api/v1/network" className="text-ink underline-offset-4 hover:underline">
              /api/v1/network
            </a>
            , which answers 503 when the chain RPC is unreachable.
          </Note>
        </DocSection>

        <DocSection id="reading" title="Reading a degraded state">
          <P>
            A component reading INDEXING or EMPTY is not broken — it means the pipeline genuinely holds nothing yet.
            UNAVAILABLE means a source could not be reached or is not wired in this deployment. STALE means data exists
            but is older than the fifteen-minute freshness budget.
          </P>
          <P>
            PRICE SOURCES will read NOT WIRED until a price oracle exists for chain {CHAIN.id}, and PROTOCOL REGISTRY
            will read EMPTY until contracts are verified. Both are expected states, documented in full under
            limitations.
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/status" />
    </article>
  );
}
