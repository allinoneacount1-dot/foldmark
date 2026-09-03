import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, EmptyState, Methodology, StateTag, AbsentValue } from "@/components/ui/primitives";
import type { DataState } from "@/lib/data-state";
import type { Surface } from "@/lib/presentation-state";
import { ExplorerLink } from "@/components/ui/controls";
import { Figure } from "@/components/ui/Figure";
import { TopologyView } from "@/components/graph/TopologyView";
import { getProtocols, getContracts, getAssets, getWindowActivity, foldByAddress, requestNow,
} from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { integer, shortAddress } from "@/lib/format";
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

  const [protocols, contracts, assetsResult, activity] = await Promise.all([
    getProtocols(),
    getContracts(),
    getAssets(),
    getWindowActivity("7D", now),
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
   * actually ran; before that the tile prints a dash and names what it waits
   * for. Contracts wait on classification, transfers on the index, and
   * counterparties on observed flow — three different sentences.
   */
  const observedActivity = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const observedContracts = contracts.state !== "INDEXING" && contracts.state !== "UNAVAILABLE";
  const tiles: { label: string; value: string | null; state: DataState; surface: Surface }[] = [
    {
      label: "CONTRACTS",
      value: observedContracts ? integer(own.length) : null,
      state: contracts.state,
      surface: "protocol",
    },
    {
      label: "TRANSFERS 7D",
      value: observedActivity ? integer(rows.length) : null,
      state: activity.state,
      surface: "activity",
    },
    {
      label: "COUNTERPARTIES",
      value: observedActivity ? integer(peers.length) : null,
      state: activity.state,
      surface: "flow",
    },
    {
      label: "ASSETS TOUCHED",
      value: observedActivity ? integer(assetsTouched.size) : null,
      state: activity.state,
      surface: "activity",
    },
  ];

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`PROTOCOL · CHAIN ${CHAIN.id}`}
          title={protocol.name}
          lede={`${protocol.category.toUpperCase()} infrastructure. Everything below is observed activity involving contracts registered to this protocol.`}
          aside={<StateTag state={protocol.verified ? "OK" : "EMPTY"} label={protocol.verified ? "VERIFIED" : "PENDING VERIFICATION"} />}
        />

        <div className="mt-6 grid gap-px bg-rule sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="bg-void p-4">
              <p className="label-s">{t.label}</p>
              {t.value !== null ? (
                <p className="tabular mt-1.5 font-mono text-data-l text-ink">{t.value}</p>
              ) : (
                <div className="mt-1.5">
                  <AbsentValue state={t.state} surface={t.surface} />
                </div>
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
                    : `Relationships involving ${protocol.name} contracts over 7D.`
                }
                provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS"
              >
                <div className="flex h-[24rem] min-h-0">
                  <TopologyView
                    graph={graph}
                    emptyHint={`No transfer involving a registered ${protocol.name} contract was observed in the last seven days.`}
                  />
                </div>
              </Figure>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader title="CONTRACTS" state={own.length ? "OK" : "INDEXING"} surface="protocol" />
                  {own.length ? (
                    <ul>
                      {own.map((c) => (
                        <li key={c.address} className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                          <ExplorerLink address={c.address} explorer={CHAIN.explorer}>
                            <span className="tabular">{shortAddress(c.address, 10, 6)}</span>
                          </ExplorerLink>
                          <span className="label-s shrink-0 text-ink-faint">{c.contract_type ?? "UNTYPED"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      state="INDEXING"
                      surface="protocol"
                      title="No contract registered"
                      detail="This protocol has a registry entry but no address attached to it yet, so no activity can be attributed to it."
                    />
                  )}
                </Panel>

                <Panel>
                  <PanelHeader
                    title="TOP COUNTERPARTIES"
                    meta="7D"
                    state={peers.length ? activity.state : "INDEXING"}
                    surface="flow"
                  />
                  {peers.length ? (
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
                  ) : (
                    <EmptyState state={activity.state} surface="flow" />
                  )}
                </Panel>

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
