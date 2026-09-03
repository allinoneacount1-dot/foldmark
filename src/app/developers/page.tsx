import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, StateTag, Display, Lede } from "@/components/ui/primitives";
import { buildAssetContext } from "@/lib/context";
import { getAssets } from "@/lib/queries";
import { SITE, CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Developers",
  description: "The FOLDMARK API: the same market context the interface shows, as structured JSON with explicit data states.",
};

export const revalidate = 60;

type Endpoint = {
  method: "GET";
  path: string;
  summary: string;
  params?: string;
  status: "ACTIVE" | "PLANNED";
};

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/network", summary: "Chain head, indexer cursor, lag and 24H totals.", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/assets", summary: "The asset registry with per-window activity.", params: "window", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/assets/{contract}", summary: "Asset passport: activity, counterparties, provenance.", params: "window", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/assets/{contract}/candles", summary: "OHLC when price observations exist, otherwise observed activity.", params: "interval, range", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/assets/{contract}/flows", summary: "Directed value edges touching one asset.", params: "window, limit", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/wallets/{address}", summary: "Wallet context: exposure, counterparties, capital movement.", params: "window", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/flows", summary: "Directed value edges and per-address net flow.", params: "window, limit", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/fabric", summary: "The market topology as nodes and edges.", params: "window, type, limit", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/protocols", summary: "The verified protocol registry and its contracts.", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/events", summary: "Most recent observed transfers, newest block first.", params: "limit", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/search", summary: "Assets, wallets, protocols and contracts by substring.", params: "q", status: "ACTIVE" },
  { method: "GET", path: "/api/v1/context/{asset}", summary: "Unified agent context for one asset.", params: "window", status: "ACTIVE" },
];

export default async function DevelopersPage() {
  const { rows } = await getAssets();
  const lead = rows[0] ?? null;
  const context = lead ? await buildAssetContext(lead.symbol) : null;

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker="MACHINE LAYER"
          title="Financial context for machines"
          lede={
            <>
              The API is the same intelligence layer as the interface, addressed structurally instead of visually. Every
              response carries its observation window, its sources and its methodology — and every unmeasured field
              carries a state rather than a number, so a consumer can tell the difference.
            </>
          }
          aside={<StateTag state="OK" label={`${ENDPOINTS.filter((e) => e.status === "ACTIVE").length} ACTIVE`} />}
        />

        <div className="mt-8">
          <Split
            ratio="7:5"
            gap="gap-8"
            left={
              <div>
                <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">ENDPOINTS</h2>
                <ul className="border border-rule">
                  {ENDPOINTS.map((e) => (
                    <li key={e.path} className="border-b border-rule-faint px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <code className="min-w-0 font-mono text-data text-ink">
                          <span className="text-ink-faint">{e.method}</span> {e.path}
                        </code>
                        <StateTag state={e.status === "ACTIVE" ? "OK" : "INDEXING"} label={e.status} />
                      </div>
                      <p className="mt-1 text-body-s text-ink-muted">{e.summary}</p>
                      {e.params ? <p className="label-s mt-1 text-ink-faint">QUERY {e.params}</p> : null}
                    </li>
                  ))}
                </ul>
                <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                  Only routes that exist in this deployment are listed. A route marked PLANNED would not respond yet —
                  there are none.
                </p>
              </div>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader title="RESPONSE CONTRACT" />
                  <ul>
                    {[
                      ["state", "OK · PARTIAL · STALE · EMPTY · INDEXING · DATA UNAVAILABLE"],
                      ["observation_window", "The trailing period every figure was computed over"],
                      ["sources", "Where the values came from"],
                      ["methodology", "How they were computed, in one paragraph"],
                      ["updated_at", "When the response was generated"],
                    ].map(([k, v]) => (
                      <li key={k} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                        <code className="font-mono text-data-s text-ink">{k}</code>
                        <span className="text-body-s text-ink-muted">{v}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel>
                  <PanelHeader title="CONVENTIONS" />
                  <ul className="flex flex-col gap-2.5 px-4 py-3 text-body-s text-ink-muted">
                    <li>Amounts are token units at each asset&apos;s own decimals, never summed across assets.</li>
                    <li>No response converts to a currency: no price oracle is wired to chain {CHAIN.id}.</li>
                    <li>Net flow appears per address only, never per token contract.</li>
                    <li>An unknown relationship is returned as UNCLASSIFIED, never guessed.</li>
                    <li>A 503 from /network means the chain RPC was unreachable, not that the chain is idle.</li>
                  </ul>
                  <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">
                    <Link href="/methodology" className="m-fast hover:text-ink">
                      FULL METHODOLOGY →
                    </Link>
                  </p>
                </Panel>
              </div>
            }
          />
        </div>

        <div className="mt-12 border-t border-rule pt-8">
          <div className="mb-5 max-w-[32rem]">
            <Display size="m">The sample is the response.</Display>
            <Lede className="mt-3">
              The block below is rendered by the same builder the route uses, against live data. It is not an
              illustration of what the API might return.
            </Lede>
          </div>

          <div className="border border-rule">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
              <code className="font-mono text-data text-ink">
                curl {SITE.url}/api/v1/context/{lead?.symbol ?? "{symbol}"}
              </code>
              <span className="label-s text-ink-faint">LIVE</span>
            </div>
            <pre className="max-h-[30rem] overflow-auto px-4 py-3 font-mono text-data-s leading-relaxed text-ink-muted">
              {context
                ? JSON.stringify(context, null, 2)
                : `{\n  "error": "ASSET_NOT_INDEXED",\n  "reason": "No asset has been observed on chain ${CHAIN.id} yet"\n}`}
            </pre>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {["/api/v1/network", "/api/v1/assets", "/api/v1/fabric", "/api/v1/flows", "/api/v1/events"].map((path) => (
              <a
                key={path}
                href={path}
                className="border border-rule px-3 py-1.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted m-fast hover:border-rule-strong hover:text-ink"
              >
                TRY {path}
              </a>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
