import type { Metadata } from "next";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, EmptyState, Methodology, StateTag } from "@/components/ui/primitives";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { getProtocols, getContracts, getAssets, getWindowActivity, foldByAddress, requestNow,
} from "@/lib/queries";
import { compact, integer, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Protocols",
  description: "Verified protocol infrastructure on Robinhood Chain, and the unclassified contracts capital is flowing through.",
};

export const revalidate = 60;

const PROTOCOL_COLUMNS: LedgerColumn[] = [
  { key: "name", label: "PROTOCOL", width: "minmax(160px, 1.4fr)" },
  { key: "cat", label: "CATEGORY", width: "minmax(120px, 1fr)" },
  { key: "verified", label: "VERIFIED", width: "minmax(100px, 0.7fr)" },
  { key: "contracts", label: "CONTRACTS", width: "minmax(100px, 0.7fr)", align: "right" },
];

const CANDIDATE_COLUMNS: LedgerColumn[] = [
  { key: "addr", label: "ADDRESS", width: "minmax(170px, 1.6fr)" },
  { key: "peers", label: "COUNTERPARTIES", width: "minmax(120px, 0.9fr)", align: "right" },
  { key: "tx", label: "TRANSFERS", width: "minmax(100px, 0.8fr)", align: "right" },
  { key: "value", label: "VALUE MOVED", width: "minmax(110px, 0.9fr)", align: "right", hideBelow: "sm" },
  { key: "class", label: "CLASSIFICATION", width: "minmax(130px, 1fr)", align: "right", hideBelow: "md" },
];

export default async function ProtocolsPage() {
  const now = await requestNow();
  const [protocols, contracts, assetsResult, activity] = await Promise.all([
    getProtocols(),
    getContracts(),
    getAssets(),
    getWindowActivity("7D", now),
  ]);

  const contractsByProtocol = new Map<string, number>();
  for (const c of contracts.rows) {
    if (!c.protocol_id) continue;
    contractsByProtocol.set(c.protocol_id, (contractsByProtocol.get(c.protocol_id) ?? 0) + 1);
  }

  // Addresses that behave like infrastructure: many distinct counterparties.
  // They are candidates for classification, not classified protocols.
  const known = new Set(contracts.rows.map((c) => c.address.toLowerCase()));
  const candidates = foldByAddress(activity.rows, assetsResult.rows, 200)
    .filter((a) => a.counterparties >= 3 && !known.has(a.address))
    .sort((a, b) => b.counterparties - a.counterparties || b.transfers - a.transfers)
    .slice(0, 12);

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`PROTOCOL GRAPH · CHAIN ${CHAIN.id}`}
          title="Only what is verified appears as a protocol"
          lede="A protocol enters this registry when its contracts are identified and verified. Until then, FOLDMARK shows the contracts capital is actually flowing through and calls them what they are: unclassified."
          aside={<StateTag state={protocols.state} label={`${integer(protocols.rows.length)} VERIFIED`} />}
        />

        <div className="mt-6">
          <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">VERIFIED REGISTRY</h2>
          <Ledger columns={PROTOCOL_COLUMNS} caption={`Protocols verified on ${CHAIN.name}`} minWidth={620}>
            {protocols.rows.length ? (
              protocols.rows.map((p) => (
                <LedgerRow key={p.id} columns={PROTOCOL_COLUMNS} href={`/protocol/${p.id}`}>
                  <LedgerCell column={PROTOCOL_COLUMNS[0]}>
                    <span className="font-mono text-data text-ink">{p.name}</span>
                  </LedgerCell>
                  <LedgerCell column={PROTOCOL_COLUMNS[1]}>
                    <span className="label-s">{p.category}</span>
                  </LedgerCell>
                  <LedgerCell column={PROTOCOL_COLUMNS[2]}>
                    <StateTag state={p.verified ? "OK" : "EMPTY"} label={p.verified ? "VERIFIED" : "PENDING"} />
                  </LedgerCell>
                  <LedgerCell column={PROTOCOL_COLUMNS[3]}>
                    <span className="tabular font-mono text-data-s text-ink">
                      {integer(contractsByProtocol.get(p.id) ?? 0)}
                    </span>
                  </LedgerCell>
                </LedgerRow>
              ))
            ) : (
              <LedgerEmpty
                state={protocols.state}
                title={`No protocol verified on chain ${CHAIN.id}`}
                detail="FOLDMARK will not list a protocol name it cannot tie to a verified contract address. An empty registry is the honest state of this chain today, not a rendering failure."
              />
            )}
          </Ledger>
        </div>

        <div className="mt-8">
          <Split
            ratio="8:4"
            gap="gap-6"
            left={
              <>
                <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">
                  UNCLASSIFIED COUNTERPARTIES · 7D
                </h2>
                <Ledger
                  columns={CANDIDATE_COLUMNS}
                  caption="Addresses with many distinct counterparties — candidates for protocol classification"
                  minWidth={720}
                >
                  {candidates.length ? (
                    candidates.map((a) => (
                      <LedgerRow key={a.address} columns={CANDIDATE_COLUMNS} href={`/wallet/${a.address}`}>
                        <LedgerCell column={CANDIDATE_COLUMNS[0]}>
                          <span className="tabular font-mono text-data text-ink">{shortAddress(a.address, 12, 8)}</span>
                        </LedgerCell>
                        <LedgerCell column={CANDIDATE_COLUMNS[1]}>
                          <span className="tabular font-mono text-data-s text-ink">{integer(a.counterparties)}</span>
                        </LedgerCell>
                        <LedgerCell column={CANDIDATE_COLUMNS[2]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(a.transfers)}</span>
                        </LedgerCell>
                        <LedgerCell column={CANDIDATE_COLUMNS[3]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">
                            {compact(a.inbound + a.outbound)}
                          </span>
                        </LedgerCell>
                        <LedgerCell column={CANDIDATE_COLUMNS[4]}>
                          <span className="label-s text-ink-faint">UNCLASSIFIED</span>
                        </LedgerCell>
                      </LedgerRow>
                    ))
                  ) : (
                    <LedgerEmpty
                      state={activity.state}
                      title="No high-degree address observed"
                      detail="An address appears here once at least three distinct counterparties transact with it inside the window."
                    />
                  )}
                </Ledger>
                <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                  A high counterparty count is a signal that an address may be infrastructure. It is not proof, and
                  FOLDMARK does not promote it to a named protocol on that basis alone.
                </p>
              </>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader title="HOW A PROTOCOL GETS LISTED" />
                  <ol className="flex flex-col">
                    {[
                      ["1 — OBSERVED", "The address appears in transfer logs with meaningful counterparty breadth."],
                      ["2 — IDENTIFIED", "Its contract is matched to a known deployment and recorded in contracts."],
                      ["3 — CATEGORISED", "It is assigned a category: DEX, lending, bridge, oracle, wallet infrastructure."],
                      ["4 — VERIFIED", "Only then does it appear above, and only then may a flow through it be classified."],
                    ].map(([k, v]) => (
                      <li key={k} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-3 last:border-b-0">
                        <span className="label-s text-ink-muted">{k}</span>
                        <span className="text-body-s text-ink-faint">{v}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>

                <Panel>
                  <PanelHeader title="KNOWN CONTRACTS" state={contracts.state} />
                  {contracts.rows.length ? (
                    <ul className="max-h-[18rem] overflow-y-auto">
                      {contracts.rows.map((c) => (
                        <li
                          key={c.address}
                          className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 last:border-b-0"
                        >
                          <span className="tabular truncate font-mono text-data-s text-ink">
                            {shortAddress(c.address, 10, 6)}
                          </span>
                          <span className="label-s shrink-0 text-ink-faint">{c.contract_type ?? "UNTYPED"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      state={contracts.state}
                      title="No contract registered"
                      detail="The contracts table is the input to protocol classification. It is empty for this chain."
                    />
                  )}
                </Panel>

                <div className="border border-rule">
                  <Methodology>
                    The verified registry reads the protocols table; contract counts read the contracts table. Neither
                    contains a name FOLDMARK invented. The unclassified list is folded from the same transfer window the
                    rest of the product uses, ranked by distinct counterparties.
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
