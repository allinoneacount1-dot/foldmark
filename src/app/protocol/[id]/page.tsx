import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, Methodology, StateTag } from "@/components/ui/primitives";
import { ExplorerLink } from "@/components/ui/controls";
import { Figure } from "@/components/ui/Figure";
import { TopologyView } from "@/components/graph/TopologyView";
import { getPulse, type Pulse } from "@/lib/chain";
import { getProtocols, getContracts, getAssets, getWindowActivity, foldByAddress, requestNow } from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { blockLabel, integer, shortAddress, utcClock } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { rows } = await getProtocols();
  const protocol = rows.find((p) => p.id === id);
  return {
    title: protocol ? `${protocol.name} — protocol` : "Protocol not registered",
    description: protocol
      ? `${protocol.name} on ${CHAIN.name}: contracts, observed activity and relationships.`
      : undefined,
  };
}

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = await requestNow();

  const [protocols, contracts, assetsResult, activity, pulse] = await Promise.all([
    getProtocols(),
    getContracts(),
    getAssets(),
    getWindowActivity("7D", now),
    getPulse(),
  ]);

  const protocol = protocols.rows.find((p) => p.id === id);
  if (!protocol) notFound();

  const own = contracts.rows.filter((c) => c.protocol_id === protocol.id);
  const ownAddresses = new Set(own.map((c) => c.address.toLowerCase()));

  const rows = activity.rows.filter(
    (r) => ownAddresses.has(r.from_address) || ownAddresses.has(r.to_address),
  );
  const graph = buildMarketGraph(rows, assetsResult.rows, { limitAddresses: 8, limitAssets: 6 });
  const peers = foldByAddress(rows, assetsResult.rows, 12).filter((a) => !ownAddresses.has(a.address));

  const assetsTouched = new Set(rows.map((r) => r.asset_id).filter(Boolean));

  /**
   * The four figures at the head of the page.
   *
   * A count of zero is only printable once the query that would have counted
   * actually ran; before that the tile holds a rule and says what would be
   * counted into it. Contracts wait on classification, transfers on the index
   * and counterparties on observed flow — three different sentences, which is
   * precisely why four identical status chips in a row were the wrong answer.
   */
  const observedActivity = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const observedContracts = contracts.state !== "INDEXING" && contracts.state !== "UNAVAILABLE";
  const tiles: { label: string; value: string | null; defines: string }[] = [
    {
      label: "CONTRACTS",
      value: observedContracts ? integer(own.length) : null,
      defines: "ADDRESSES REGISTERED TO THIS PROTOCOL",
    },
    {
      label: "TRANSFERS 7D",
      value: observedActivity ? integer(rows.length) : null,
      defines: "TRANSFERS TOUCHING A REGISTERED ADDRESS",
    },
    {
      label: "COUNTERPARTIES",
      value: observedActivity ? integer(peers.length) : null,
      defines: "DISTINCT ADDRESSES ON THE OTHER SIDE",
    },
    {
      label: "ASSETS TOUCHED",
      value: observedActivity ? integer(assetsTouched.size) : null,
      defines: "DISTINCT ASSETS IN THOSE TRANSFERS",
    },
  ];

  const hasContracts = own.length > 0;
  const hasPeers = peers.length > 0;

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`PROTOCOL · CHAIN ${CHAIN.id}`}
          title={protocol.name}
          lede={`${protocol.category.toUpperCase()} infrastructure. Everything below is observed activity involving contracts registered to this protocol.`}
          /* The page's one chip, and it is a statement about the protocol's
             verification — not about our index. Nothing below repeats it. */
          aside={
            <StateTag
              state={protocol.verified ? "OK" : "EMPTY"}
              label={protocol.verified ? "VERIFIED" : "PENDING VERIFICATION"}
            />
          }
        />

        <div className="mt-6">
          <ChainStrip pulse={pulse} />
        </div>

        <div className="mt-6 grid border-t border-l border-rule sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="border-b border-r border-rule bg-void p-4">
              <p className="label-s">{t.label}</p>
              {t.value !== null ? (
                <p className="tabular mt-1.5 font-mono text-data-l text-ink">{t.value}</p>
              ) : (
                <FigureSlot defines={t.defines} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Split
            ratio="7:5"
            gap="gap-6"
            left={
              <Figure
                index="01"
                caption={
                  graph.shown.nodes > 0
                    ? `Relationships involving ${protocol.name} contracts over 7D — ${integer(graph.shown.nodes)} nodes, ${integer(graph.shown.edges)} edges.`
                    : `Relationships involving ${protocol.name} contracts over 7D — registered addresses at the centre of the counterparties and assets one hop from them.`
                }
                provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS"
              >
                <div className="flex h-[24rem] min-h-0">
                  <TopologyView
                    graph={graph}
                    state={activity.state}
                    emptyHint={`No transfer involving a registered ${protocol.name} contract was observed in the last seven days.`}
                  />
                </div>
              </Figure>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader title="CONTRACTS" meta={hasContracts ? undefined : "ATTRIBUTION PENDING"} />
                  {hasContracts ? (
                    <ul>
                      {own.map((c) => (
                        <li
                          key={c.address}
                          className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                        >
                          <ExplorerLink address={c.address} explorer={CHAIN.explorer}>
                            <span className="tabular">{shortAddress(c.address, 10, 6)}</span>
                          </ExplorerLink>
                          <span className="label-s shrink-0 text-ink-faint">{c.contract_type ?? "UNTYPED"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    /* A registry entry with no address attached to it. The panel
                       says what that means for the page rather than repeating a
                       status word: no address, no attribution, no activity. */
                    <>
                      <p className="border-b border-rule-faint px-4 py-3 text-body-s text-ink-muted">
                        This protocol has a registry entry but no contract address attached to it, so no transfer on
                        chain {CHAIN.id} can yet be attributed to it. The figures above wait on that attribution, not on
                        the chain.
                      </p>
                      <dl className="flex flex-col">
                        {CONTRACT_FIELDS.map(([term, detail]) => (
                          <div
                            key={term}
                            className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                          >
                            <dt className="label-s text-ink-muted">{term}</dt>
                            <dd className="text-body-s text-ink-faint">{detail}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                </Panel>

                {hasPeers ? (
                  <Panel>
                    <PanelHeader title="TOP COUNTERPARTIES" meta="7D" state={activity.state} surface="flow" />
                    <ul>
                      {peers.slice(0, 8).map((p) => (
                        <li key={p.address}>
                          <a
                            href={`/wallet/${p.address}`}
                            className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 m-fast last:border-b-0 hover:bg-raised"
                          >
                            <span className="tabular truncate font-mono text-data-s text-ink">
                              {shortAddress(p.address, 10, 6)}
                            </span>
                            {/* A protocol touches many assets, so this counts rather than sums. */}
                            <span className="tabular shrink-0 font-mono text-data-s text-ink-muted">
                              {integer(p.transfers)} TX
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : (
                  /* The inspector shell: every field this page holds and the one
                     source each is read from. A field is filled from its own
                     source or not at all, and none is inferred from another. */
                  <Panel>
                    <PanelHeader title="PROTOCOL INSPECTOR" meta="FIELDS AND SOURCES" />
                    <dl className="flex flex-col">
                      {INSPECTOR_FIELDS.map(([field, source]) => (
                        <div
                          key={field}
                          className="flex items-baseline justify-between gap-4 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                        >
                          <dt className="label-s shrink-0 text-ink-muted">{field}</dt>
                          <dd className="min-w-0 text-right text-body-s text-ink-faint">{source}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                      A counterparty is listed only where it appears opposite a registered address in a real transfer.
                    </p>
                  </Panel>
                )}

                <div className="border border-rule">
                  <PanelHeader title="DATA SOURCE" />
                  <div className="px-4 py-3">
                    <p className="text-body-s text-ink-muted">
                      Identity from the protocols registry. Addresses from the contracts registry. Activity folded from
                      indexed Transfer logs where a registered address is the sender or the recipient.
                    </p>
                    {protocol.website ? (
                      <p className="mt-2">
                        <a
                          href={protocol.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-data-s text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                        >
                          {protocol.website.replace(/^https?:\/\//, "")}
                        </a>
                      </p>
                    ) : null}
                  </div>
                  <Methodology>
                    A flow is attributed to this protocol only when one side of the transfer is an address registered to
                    it. FOLDMARK does not infer protocol membership from behaviour.
                  </Methodology>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </Shell>
  );
}

/* ==========================================================================
   Live chain identity
   ========================================================================== */

/**
 * The values that are true with no database attached: chain id from
 * configuration, head, endpoint and round trip measured on this request. A
 * protocol with nothing attributed to it yet is still being read against a
 * live chain, and this line is where the page says so.
 */
function ChainStrip({ pulse, children }: { pulse: Pulse; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-rule bg-surface px-4 py-2.5">
      <ChainFact label="CHAIN" value={String(CHAIN.id)} />
      <ChainFact label="HEAD" value={blockLabel(pulse.block)} />
      <ChainFact label="RPC" value={pulse.endpoint} tone="muted" />
      {pulse.latencyMs !== null ? (
        <ChainFact label="ROUND TRIP" value={`${integer(pulse.latencyMs)} MS`} tone="muted" />
      ) : null}
      <ChainFact label="READ AT" value={utcClock(pulse.updatedAt)} tone="muted" />
      {children ? <div className="ml-auto shrink-0">{children}</div> : null}
    </div>
  );
}

function ChainFact({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "muted" }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="label-s shrink-0 text-ink-dim">{label}</span>
      <span className={`tabular truncate font-mono text-data-s ${tone === "muted" ? "text-ink-muted" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

/* ==========================================================================
   Absence, designed
   ========================================================================== */

/**
 * A metric slot with no metric in it: a short rule where the numeral would sit,
 * and a line saying what will be counted into it rather than repeating the
 * page's state. The rule occupies the slot without asserting a value.
 */
function FigureSlot({ defines }: { defines: string }) {
  return (
    <>
      <span aria-hidden className="mt-1.5 flex h-[1.375rem] items-end">
        <span className="block h-px w-8 bg-rule-strong" />
      </span>
      <p className="label-s mt-1 text-ink-faint">{defines}</p>
    </>
  );
}

/** What attaching a contract to this protocol requires. */
const CONTRACT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["ADDRESS", `A deployment on chain ${CHAIN.id}, recorded in the contracts registry.`],
  ["TYPE", "What the contract is, or UNTYPED where that is not established."],
  ["ATTRIBUTION", "The registry entry that ties it to this protocol. Behaviour alone never does."],
];

/** Every field this page holds, and the one source each reads. */
const INSPECTOR_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["IDENTITY", "protocols registry"],
  ["CATEGORY", "protocols registry"],
  ["CONTRACTS", "contracts registry"],
  ["TRANSFERS", "folded from Transfer logs"],
  ["COUNTERPARTIES", "folded from Transfer logs"],
  ["ASSETS TOUCHED", "folded from Transfer logs"],
  ["RELATIONSHIPS", "market graph over registered addresses"],
];
