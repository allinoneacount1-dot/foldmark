import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, StateTag } from "@/components/ui/primitives";
import { Ledger, LedgerRow, LedgerCell, type LedgerColumn } from "@/components/ui/Ledger";
import { AddressLookup } from "@/components/forms/AddressLookup";
import { getPulse, type Pulse } from "@/lib/chain";
import {
  getAssets,
  getWindowActivity,
  getObservedWallets,
  foldByAddress,
  dominantFlow,
  countRows,
  requestNow,
} from "@/lib/queries";
import { blockLabel, compact, integer, relativeTime, shortAddress, utcClock } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Wallet explorer",
  description: "Inspect any public Robinhood Chain address: exposure, counterparties, capital movement and activity.",
};

export const revalidate = 30;

/**
 * This table spans every asset, so it carries no RECEIVED / SENT column.
 *
 * A received figure summed over NVDA, AAPL and USDG has no unit and no meaning.
 * What is comparable across assets is counted: transfers, assets touched,
 * counterparties. The one amount shown is scoped to a single named asset.
 */
const COLUMNS: LedgerColumn[] = [
  { key: "addr", label: "ADDRESS", width: "minmax(170px, 1.6fr)" },
  { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right" },
  { key: "assets", label: "ASSETS", width: "minmax(80px, 0.6fr)", align: "right" },
  { key: "peers", label: "COUNTERPARTIES", width: "minmax(110px, 0.8fr)", align: "right" },
  { key: "main", label: "LARGEST FLOW", width: "minmax(140px, 1fr)", align: "right", hideBelow: "sm" },
];

export default async function WalletsPage() {
  const now = await requestNow();
  const [assetsResult, activity, observed, walletCount, pulse] = await Promise.all([
    getAssets(),
    getWindowActivity("24H", now),
    getObservedWallets(40),
    countRows("wallets"),
    getPulse(),
  ]);

  const active = foldByAddress(activity.rows, assetsResult.rows, 20);
  const symbols = new Map(assetsResult.rows.map((a) => [a.id, a.symbol]));
  const hasActive = active.length > 0;
  const hasObserved = observed.rows.length > 0;

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`WALLET INTELLIGENCE · CHAIN ${CHAIN.id}`}
          title="Read any address as a position"
          lede="Paste a public address to see what it holds exposure to, who it trades against and how value has moved through it. No connection and no signature required."
          /* The page's one state chip. Every other region below says what it
             holds rather than repeating this. */
          aside={
            <StateTag
              state={walletCount.state}
              surface="wallet"
              label={walletCount.value !== null ? `${integer(walletCount.value)} OBSERVED` : undefined}
            />
          }
        />

        <div className="mt-6">
          <AddressLookup />
        </div>

        {/* Lookup works against any address on a live chain, so the values that
            prove the chain is live belong directly under the field. All four
            are measured on this request; none comes from the index. */}
        <div className="mt-6">
          <ChainStrip pulse={pulse} />
        </div>

        {hasActive ? null : (
          <div className="mt-8">
            <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">WHAT A WALLET PAGE CAPTURES</h2>
            {/* Four captures divide evenly into one, two and four columns, so
                the rule-toned gap can never show through a cell no capture
                occupies. That is the condition for using this technique. */}
            <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
              {CAPTURES.map((c, i) => (
                <div key={c.name} className="flex flex-col bg-void p-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="label-s tabular text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                    <span className="label text-ink">{c.name}</span>
                  </div>
                  <div className="mt-4 mb-4">{c.glyph}</div>
                  <p className="text-body-s text-ink-muted">{c.detail}</p>
                  <p className="label-s mt-auto pt-3 text-ink-faint">{c.derivation}</p>
                </div>
              ))}
            </div>
            <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
              Four readings of one address, each folded from the same source: ERC-20 Transfer logs where the address is
              sender or recipient. A portfolio value in a currency is not among them while no price oracle is wired to
              chain {CHAIN.id}.
            </p>
          </div>
        )}

        <div className="mt-8">
          <Split
            ratio="8:4"
            gap="gap-6"
            left={
              <>
                <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">MOST ACTIVE · 24H</h2>
                <Ledger
                  columns={COLUMNS}
                  caption="Addresses ranked by transfers observed in the last 24 hours"
                  minWidth={720}
                >
                  {hasActive ? (
                    active.map((a) => {
                      const largest = dominantFlow(a, "inbound") ?? dominantFlow(a, "outbound");
                      const largestSymbol = largest ? (symbols.get(largest.assetId) ?? null) : null;
                      return (
                        <LedgerRow key={a.address} columns={COLUMNS} href={`/wallet/${a.address}`}>
                          <LedgerCell column={COLUMNS[0]}>
                            <span className="tabular font-mono text-data text-ink">{shortAddress(a.address, 12, 8)}</span>
                          </LedgerCell>
                          <LedgerCell column={COLUMNS[1]}>
                            <span className="tabular font-mono text-data-s text-ink">{integer(a.transfers)}</span>
                          </LedgerCell>
                          <LedgerCell column={COLUMNS[2]}>
                            <span className="tabular font-mono text-data-s text-ink-muted">{integer(a.assets)}</span>
                          </LedgerCell>
                          <LedgerCell column={COLUMNS[3]}>
                            <span className="tabular font-mono text-data-s text-ink-muted">
                              {integer(a.counterparties)}
                            </span>
                          </LedgerCell>
                          <LedgerCell column={COLUMNS[4]}>
                            {largest ? (
                              <span className="tabular font-mono text-data-s text-signal">
                                {compact(Math.max(largest.inbound, largest.outbound))}{" "}
                                <span className="text-ink-faint">{largestSymbol ?? "UNKNOWN"}</span>
                              </span>
                            ) : (
                              <span className="label-s text-ink-faint">—</span>
                            )}
                          </LedgerCell>
                        </LedgerRow>
                      );
                    })
                  ) : (
                    /* One designed empty state for the ledger, and the headers
                       above it left intact. An observed-and-quiet 24 hours is a
                       finding about the chain and is stated as one; a window
                       the index has not reached is not. */
                    <LedgerVoid
                      title={
                        activity.state === "EMPTY"
                          ? "No address active in the last 24 hours"
                          : "Awaiting the first indexed transfer"
                      }
                      detail={
                        activity.state === "EMPTY"
                          ? "The index covered this period and found no address party to a transfer in it. Addresses appear here as soon as one is observed."
                          : "An address enters this ranking the moment the indexer observes a transfer involving it. Until then the lookup above still opens any address on the chain."
                      }
                    />
                  )}
                </Ledger>
                <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                  Ranked by transfers observed, which is comparable across assets. LARGEST FLOW names one asset and
                  quotes the amount in that asset&rsquo;s units — amounts are never added together across assets. Open
                  an address to see received against sent per asset. Nothing here is a claim about intent or balances
                  held.
                </p>
              </>
            }
            right={
              <div className="flex flex-col gap-6">
                {hasObserved ? (
                  <Panel>
                    <PanelHeader title="RECENTLY SEEN" meta="BY LAST ACTIVITY" state={observed.state} surface="wallet" />
                    <ul className="max-h-[22rem] overflow-y-auto">
                      {observed.rows.map((w) => (
                        <li key={w.address}>
                          <a
                            href={`/wallet/${w.address}`}
                            className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 m-fast last:border-b-0 hover:bg-raised"
                          >
                            <span className="tabular truncate font-mono text-data-s text-ink">
                              {shortAddress(w.address, 10, 6)}
                            </span>
                            <span className="label-s shrink-0 text-ink-faint">{relativeTime(w.last_seen, now)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : (
                  /* The RECENTLY SEEN list is written by the indexer from
                     transfer participants. Rather than a panel repeating the
                     page's pending sentence, its slot holds the rule that
                     governs it: how an address earns a row. */
                  <Panel>
                    <PanelHeader title="HOW AN ADDRESS ENTERS THIS INDEX" />
                    <ol className="flex flex-col">
                      {ENTRY_STEPS.map(([step, detail]) => (
                        <li key={step} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-3 last:border-b-0">
                          <span className="label-s text-ink-muted">{step}</span>
                          <span className="text-body-s text-ink-faint">{detail}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                      No address is ever added by hand, and none is invented to fill this list.
                    </p>
                  </Panel>
                )}

                <Panel>
                  <PanelHeader title="WHAT IS WITHHELD" />
                  <dl className="flex flex-col">
                    {WITHHELD.map(([term, why]) => (
                      <div key={term} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                        <dt className="label-s text-ink-muted">{term}</dt>
                        <dd className="text-body-s text-ink-faint">{why}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    A withheld figure is a decision, not a gap. Each returns the moment its input exists.
                  </p>
                </Panel>
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
 * The values that are true with no database attached.
 *
 * Chain id comes from configuration; head, endpoint and round trip are measured
 * on this request. None of it is derived from the index, which is why it can
 * sit under a lookup field on a page whose index is empty: the address the
 * reader types will be read against this chain, at this head.
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
   Capability composition
   ========================================================================== */

/**
 * The four readings a wallet page produces.
 *
 * These are capabilities of the product, not observations of a market, so they
 * are true before the first transfer is indexed and can be shown as finished
 * work. The glyph beside each one is a schematic: it carries no value, no
 * label and no magnitude, and its geometry is deliberately regular — equal
 * spokes, equal segments, equal ticks — because a real reading never is.
 */
const GLYPH_CLASS = "h-14 w-full text-ink-faint";

/** Left-aligned in its cell, so the schematic sits on the same margin as the
 *  words describing it rather than floating in the middle of the column. */
const GLYPH_FIT = "xMinYMid meet";

function GlyphCounterparties() {
  const centre = { x: 60, y: 24 };
  const r = 16;
  const points = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: centre.x + r * Math.cos(rad), y: centre.y + r * Math.sin(rad) };
  });
  return (
    <svg viewBox="0 0 120 48" preserveAspectRatio={GLYPH_FIT} className={GLYPH_CLASS} role="presentation" aria-hidden="true">
      <g stroke="var(--color-rule-strong)" strokeWidth="1">
        {points.map((p, i) => (
          <line key={i} x1={centre.x} y1={centre.y} x2={p.x} y2={p.y} />
        ))}
      </g>
      <g fill="var(--color-ink-faint)">
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" />
        ))}
      </g>
      <circle cx={centre.x} cy={centre.y} r="3" fill="var(--color-ink-muted)" />
    </svg>
  );
}

function GlyphExposure() {
  const rows = [12, 24, 36];
  return (
    <svg viewBox="0 0 120 48" preserveAspectRatio={GLYPH_FIT} className={GLYPH_CLASS} role="presentation" aria-hidden="true">
      <line x1="60" y1="6" x2="60" y2="42" stroke="var(--color-rule-strong)" strokeWidth="1" />
      <g stroke="var(--color-ink-faint)" strokeWidth="3">
        {rows.map((y) => (
          <line key={`l${y}`} x1="34" y1={y} x2="57" y2={y} />
        ))}
        {rows.map((y) => (
          <line key={`r${y}`} x1="63" y1={y} x2="86" y2={y} />
        ))}
      </g>
    </svg>
  );
}

function GlyphHistory() {
  const ticks = [24, 36, 48, 60, 72, 84, 96];
  return (
    <svg viewBox="0 0 120 48" preserveAspectRatio={GLYPH_FIT} className={GLYPH_CLASS} role="presentation" aria-hidden="true">
      <line x1="20" y1="38" x2="100" y2="38" stroke="var(--color-rule-strong)" strokeWidth="1" />
      <g stroke="var(--color-ink-faint)" strokeWidth="2">
        {ticks.map((x) => (
          <line key={x} x1={x} y1="38" x2={x} y2="16" />
        ))}
      </g>
    </svg>
  );
}

function GlyphTouchpoints() {
  const targets = [11, 24, 37];
  return (
    <svg viewBox="0 0 120 48" preserveAspectRatio={GLYPH_FIT} className={GLYPH_CLASS} role="presentation" aria-hidden="true">
      <g fill="none" stroke="var(--color-rule-strong)" strokeWidth="1">
        {targets.map((y) => (
          <path key={y} d={`M40 24H60V${y}H78`} />
        ))}
      </g>
      <rect x="18" y="18" width="22" height="12" fill="var(--color-surface)" stroke="var(--color-ink-faint)" strokeWidth="1" />
      {targets.map((y) => (
        <rect
          key={y}
          x="78"
          y={y - 5}
          width="22"
          height="10"
          fill="var(--color-surface)"
          stroke="var(--color-ink-faint)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

const CAPTURES: ReadonlyArray<{ name: string; detail: string; derivation: string; glyph: ReactNode }> = [
  {
    name: "COUNTERPARTIES",
    detail: "Every address this one traded against, ranked by transfers, with the direction of each relationship.",
    derivation: "FOLDED FROM TRANSFER LOGS",
    glyph: <GlyphCounterparties />,
  },
  {
    name: "ASSET EXPOSURE",
    detail: "Received against sent for each asset the address touched, with the net in that asset's own units.",
    derivation: "PER ASSET · NEVER SUMMED ACROSS ASSETS",
    glyph: <GlyphExposure />,
  },
  {
    name: "FLOW HISTORY",
    detail: "Transfers bucketed across the selected window, so activity can be read as a rate rather than a total.",
    derivation: "BUCKETED OVER THE WINDOW",
    glyph: <GlyphHistory />,
  },
  {
    name: "PROTOCOL TOUCHPOINTS",
    detail: "Which counterparties are registered contracts, and which remain unclassified because nothing identifies them.",
    derivation: "MATCHED AGAINST THE CONTRACT REGISTRY",
    glyph: <GlyphTouchpoints />,
  },
];

/** How a row appears in the observed list. The rule, not a status. */
const ENTRY_STEPS: ReadonlyArray<readonly [string, string]> = [
  ["1 — LOG READ", `The indexer reads an ERC-20 Transfer log from a block on chain ${CHAIN.id}.`],
  ["2 — PARTICIPANTS EXTRACTED", "Both sides of that transfer are recorded as addresses, sender and recipient alike."],
  ["3 — LAST SEEN STAMPED", "The address carries the timestamp of the most recent transfer it was party to."],
  ["4 — LISTED", "It appears here, and its own page opens on the activity that put it there."],
];

/** Figures this product declines to produce, and why. */
const WITHHELD: ReadonlyArray<readonly [string, string]> = [
  ["PORTFOLIO VALUE", `Requires a price oracle for chain ${CHAIN.id}. None is wired, so no currency total is shown.`],
  ["BALANCE", "Requires the full transfer history for an address, not a window of it. A window shows movement only."],
  ["PROFIT AND LOSS", "Requires both a cost basis and a price. Neither is observable from transfer logs alone."],
  ["WALLET LABELS", "Requires an identity claim. FOLDMARK names a counterparty only from a verified contract."],
];
