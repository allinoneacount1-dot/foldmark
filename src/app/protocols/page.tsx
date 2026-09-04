import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, Methodology, StateTag } from "@/components/ui/primitives";
import { Ledger, LedgerRow, LedgerCell, type LedgerColumn } from "@/components/ui/Ledger";
import { Figure } from "@/components/ui/Figure";
import { getPulse, type Pulse } from "@/lib/chain";
import { getProtocols, getContracts, getAssets, getWindowActivity, foldByAddress, requestNow } from "@/lib/queries";
import { blockLabel, integer, shortAddress, utcClock } from "@/lib/format";
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
  { key: "assets", label: "ASSETS", width: "minmax(110px, 0.9fr)", align: "right", hideBelow: "sm" },
  { key: "class", label: "CLASSIFICATION", width: "minmax(130px, 1fr)", align: "right", hideBelow: "md" },
];

export default async function ProtocolsPage() {
  const now = await requestNow();
  const [protocols, contracts, assetsResult, activity, pulse] = await Promise.all([
    getProtocols(),
    getContracts(),
    getAssets(),
    getWindowActivity("7D", now),
    getPulse(),
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

  const hasRegistry = protocols.rows.length > 0;
  const hasCandidates = candidates.length > 0;
  const hasContracts = contracts.rows.length > 0;

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`PROTOCOL GRAPH · CHAIN ${CHAIN.id}`}
          title="Only what is verified appears as a protocol"
          lede="A protocol enters this registry when its contracts are identified and verified. Until then, FOLDMARK shows the contracts capital is actually flowing through and calls them what they are: unclassified."
          /* The page's one state chip. Nothing below repeats it — a registry
             still filling should be said once, not once per empty region. */
          aside={
            <StateTag
              state={protocols.state}
              surface="protocol"
              /* 0 VERIFIED is a claim about the chain, and it is only ours to
                 make once the registry has actually answered. */
              label={hasRegistry ? `${integer(protocols.rows.length)} VERIFIED` : undefined}
            />
          }
        />

        <div className="mt-6">
          <ChainStrip pulse={pulse} />
        </div>

        <div className="mt-6">
          <Figure
            index="01"
            caption="The classification pipeline: how an observed address becomes a named protocol, and what each stage requires."
            provenance="FOLDMARK CLASSIFICATION MODEL · STRUCTURE ONLY, NO OBSERVATIONS"
            aside={<span className="label-s border border-rule px-1.5 py-0.5 text-ink-faint">ARCHITECTURE</span>}
          >
            <div className="flex min-h-0 flex-col">
              {/* The pipeline has a minimum legible width, so on a narrow
                  screen it scrolls inside its own region rather than shrinking
                  its stage names to four pixels. The page itself never scrolls
                  sideways. */}
              <div className="w-full overflow-x-auto px-4 py-6 sm:px-6">
                <div className="min-w-[660px]">
                  <ClassificationPipeline />
                </div>
              </div>
              {/* Four stages divide evenly into one, two and four columns, so
                  the rule-toned gap can never show through a cell no stage
                  occupies. That is the condition for using this technique. */}
              <dl className="grid grid-cols-1 gap-px border-t border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
                {STAGES.map((s) => (
                  <div key={s.name} className="flex flex-col gap-1 bg-void px-4 py-3">
                    <dt className="label-s text-ink-muted">
                      {s.index} — {s.name}
                    </dt>
                    <dd className="text-body-s text-ink-faint">{s.detail}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-4 py-3">
                <span className="label-s shrink-0 text-ink-dim">CATEGORIES</span>
                <ul className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <li
                      key={c}
                      className="border border-rule px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint"
                    >
                      {c}
                    </li>
                  ))}
                  <li className="border border-rule-strong px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink">
                    UNCLASSIFIED
                  </li>
                </ul>
              </div>
              <p className="label-s border-t border-rule-faint px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                UNCLASSIFIED is one of these categories, not the absence of one. It is the correct and final answer for a
                real counterparty whose identity nothing on chain establishes.
              </p>
            </div>
          </Figure>
        </div>

        <div className="mt-8">
          <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">VERIFIED REGISTRY</h2>
          <Ledger columns={PROTOCOL_COLUMNS} caption={`Protocols verified on ${CHAIN.name}`} minWidth={620}>
            {hasRegistry ? (
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
              /* "The registry is empty" is a measurement, and it belongs to the
                 state where the registry actually answered. Before that, the
                 honest line is how a protocol earns a row. Either way it is
                 said once, under headers that stay. */
              <LedgerVoid
                title={
                  protocols.state === "EMPTY"
                    ? `No protocol verified on chain ${CHAIN.id}`
                    : "The registry has not answered yet"
                }
                detail={
                  protocols.state === "EMPTY"
                    ? "FOLDMARK will not list a protocol name it cannot tie to a verified contract address. An empty registry is the honest state of this chain today, not a rendering failure."
                    : "A protocol earns a row here when its contracts are identified and verified against on-chain deployments, as the pipeline above sets out. A name alone is never enough."
                }
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
                  {hasCandidates ? (
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
                          {/* Assets touched, not a summed amount: this list spans assets. */}
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(a.assets)}</span>
                        </LedgerCell>
                        <LedgerCell column={CANDIDATE_COLUMNS[4]}>
                          {/* A real answer about a real address, not a status
                              word standing in for one. */}
                          <span className="label-s text-ink-faint">UNCLASSIFIED</span>
                        </LedgerCell>
                      </LedgerRow>
                    ))
                  ) : (
                    <LedgerVoid
                      title={
                        activity.state === "EMPTY"
                          ? "No high-degree address observed"
                          : "No candidate has surfaced yet"
                      }
                      detail="An address appears here once at least three distinct counterparties transact with it inside the window. Breadth is the only signal used, and it never promotes an address to a name on its own."
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
                {/* The shell of a protocol page: every field it will hold, and
                    the single source each is read from. A field is filled from
                    its own source or not at all. */}
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
                    No field is inferred from another. A protocol page opens only for an entry that exists in the
                    registry, so it never renders a name FOLDMARK assembled itself.
                  </p>
                </Panel>

                {hasContracts ? (
                  <Panel>
                    <PanelHeader title="KNOWN CONTRACTS" state={contracts.state} surface="protocol" />
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
                  </Panel>
                ) : (
                  /* The contracts registry is the input to stage 02. With
                     nothing in it, the panel states the rule that governs entry
                     rather than repeating the page's condition. */
                  <Panel>
                    <PanelHeader title="KNOWN CONTRACTS" meta="INPUT TO STAGE 02" />
                    <dl className="flex flex-col">
                      {CONTRACT_ENTRY.map(([term, detail]) => (
                        <div key={term} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                          <dt className="label-s text-ink-muted">{term}</dt>
                          <dd className="text-body-s text-ink-faint">{detail}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                      An address enters this registry once a deployment is identified. It is never added to make a page
                      look populated.
                    </p>
                  </Panel>
                )}

                <div className="border border-rule">
                  <div className="border-b border-rule px-4 py-2.5">
                    <span className="label text-ink">DATA CONDITION</span>
                  </div>
                  <Methodology>
                    The verified registry reads the protocols table; contract counts read the contracts table. Neither
                    contains a name FOLDMARK invented. The unclassified list is folded from the same transfer window the
                    rest of the product uses, ranked by distinct counterparties. The pipeline above is product
                    structure, not an observation: it is true whether or not any protocol has yet been verified on this
                    chain.
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
 * registry can be empty while the chain it describes is demonstrably live, and
 * saying both at once is the honest reading of this page.
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
 * The one empty state a ledger gets: headers intact, one sentence, and three
 * ruled lines marking where rows will be drawn. Equal lengths, even spacing —
 * regularity is the tell that this is stationery rather than a reading.
 */
function LedgerVoid({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0 max-w-[52ch]">
        <p className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">{title}</p>
        <p className="mt-2 text-body-s text-ink-muted">{detail}</p>
      </div>
      <div aria-hidden className="flex w-full shrink-0 flex-col gap-3 sm:w-[15rem]">
        <span className="block h-px w-full bg-rule" />
        <span className="block h-px w-full bg-rule" />
        <span className="block h-px w-full bg-rule" />
      </div>
    </div>
  );
}

/* ==========================================================================
   Classification architecture
   ========================================================================== */

const STAGES = [
  {
    index: "01",
    name: "OBSERVED",
    detail: "The address appears in transfer logs with meaningful counterparty breadth.",
  },
  {
    index: "02",
    name: "IDENTIFIED",
    detail: "Its contract is matched to a known deployment and recorded in the contracts registry.",
  },
  {
    index: "03",
    name: "CATEGORISED",
    detail: "It is assigned one category: DEX, lending, bridge, oracle or wallet infrastructure.",
  },
  {
    index: "04",
    name: "VERIFIED",
    detail: "Only then does it appear in the registry, and only then may a flow through it be classified.",
  },
] as const;

/** Product vocabulary, not an observation: the categories a protocol may hold. */
const CATEGORIES = ["DEX", "LENDING", "BRIDGE", "ORACLE", "INFRASTRUCTURE"] as const;

/** The protocol page, as a shell: every field, and the one source it reads. */
const INSPECTOR_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["IDENTITY", "protocols registry"],
  ["CATEGORY", "protocols registry"],
  ["CONTRACTS", "contracts registry"],
  ["TRANSFERS", "folded from Transfer logs"],
  ["COUNTERPARTIES", "folded from Transfer logs"],
  ["ASSETS TOUCHED", "folded from Transfer logs"],
  ["RELATIONSHIPS", "market graph over registered addresses"],
];

/** What puts an address into the contracts registry. */
const CONTRACT_ENTRY: ReadonlyArray<readonly [string, string]> = [
  ["DEPLOYMENT MATCHED", "The bytecode or deployment is tied to a contract FOLDMARK can name."],
  ["TYPE RECORDED", "The contract is stored with its type, or with UNTYPED when the type is not established."],
  ["ATTRIBUTED", "Where a protocol owns it, the contract carries that protocol's id — and activity follows."],
];

/**
 * The classification pipeline, drawn.
 *
 * Four stages and the gates between them. It contains no address, no name and
 * no count: it is the rule the product follows, which is true on a chain with
 * a hundred verified protocols and on one with none. Every box is the same
 * size, because none of them is a quantity.
 */
const STAGE_W = 160;
const STAGE_H = 46;
const STAGE_X = [16, 205, 394, 583] as const;

function ClassificationPipeline() {
  return (
    <svg
      viewBox="0 0 760 96"
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      role="img"
      aria-label="Classification pipeline: an address is observed, then identified against a known deployment, then categorised, then verified. Only a verified protocol is listed, and only then may a flow through it be classified. A structural diagram containing no observed data."
    >
      <defs>
        <marker
          id="fm-protocol-stage-arrow"
          viewBox="0 0 6 6"
          refX="6"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0 0 6 3 0 6Z" fill="var(--color-ink-faint)" />
        </marker>
      </defs>

      <g fill="none" stroke="var(--color-ink-faint)" strokeWidth="1" markerEnd="url(#fm-protocol-stage-arrow)">
        {STAGE_X.slice(0, 3).map((x, i) => (
          <line key={x} x1={x + STAGE_W} y1={STAGE_H / 2 + 24} x2={STAGE_X[i + 1]} y2={STAGE_H / 2 + 24} />
        ))}
      </g>

      {STAGES.map((s, i) => {
        const x = STAGE_X[i];
        const last = i === STAGES.length - 1;
        return (
          <g key={s.name}>
            <rect
              x={x}
              y={24}
              width={STAGE_W}
              height={STAGE_H}
              fill="var(--color-surface)"
              stroke={last ? "var(--color-rule-strong)" : "var(--color-rule-strong)"}
              strokeWidth="1"
            />
            {/* The one accent: the gate a protocol must pass to be listed. */}
            {last ? <rect x={x} y={24} width="2" height={STAGE_H} fill="var(--color-signal)" /> : null}
            <text
              x={x + 12}
              y={41}
              fontFamily="var(--font-mono)"
              fontSize="9"
              letterSpacing="1.6"
              fill="var(--color-ink-faint)"
            >
              {s.index}
            </text>
            <text
              x={x + STAGE_W / 2}
              y={58}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              letterSpacing="1.6"
              fill={last ? "var(--color-ink)" : "var(--color-ink-muted)"}
            >
              {s.name}
            </text>
          </g>
        );
      })}

      <text
        x={STAGE_X[3] + STAGE_W / 2}
        y={88}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="9"
        letterSpacing="1.6"
        fill="var(--color-ink-faint)"
      >
        LISTED · FLOWS CLASSIFIABLE
      </text>
      <text
        x={STAGE_X[0] + STAGE_W / 2}
        y={16}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="9"
        letterSpacing="1.6"
        fill="var(--color-ink-faint)"
      >
        FROM TRANSFER LOGS
      </text>
    </svg>
  );
}
