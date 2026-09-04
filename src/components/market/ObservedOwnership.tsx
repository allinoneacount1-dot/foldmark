import Link from "next/link";
import { shortAddress } from "@/lib/format";
import type { OwnershipSnapshot } from "@/server/ownership/balances";

/**
 * Observed ownership for one asset.
 *
 * This panel deliberately does NOT show a holder count, a rank, or a percentage
 * of supply. Those require complete transfer history, and FOLDMARK follows the
 * head of the chain rather than reaching an asset's first transfer. What it can
 * honestly show is net movement across the window it observed, labelled as that.
 *
 * The heading says NET CHANGE rather than BALANCE for the same reason: an
 * address holding a large position before the index began, and moving nothing
 * since, appears here as zero. Calling that a balance would be false.
 */
export function ObservedOwnership({
  ownership,
  decimals,
  symbol,
}: {
  ownership: OwnershipSnapshot;
  decimals: number;
  symbol: string;
}) {
  if (ownership.coverage === "UNAVAILABLE" || ownership.observedAddresses === 0) return null;

  /** Base units to display units. Kept as a string: these can exceed a double. */
  const units = (v: bigint): string => {
    const negative = v < 0n;
    const abs = negative ? -v : v;
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;
    const fracText = frac === 0n ? "" : `.${frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "")}`;
    const wholeText = whole.toLocaleString("en-US");
    return `${negative ? "−" : ""}${wholeText}${fracText === "." ? "" : fracText}`;
  };

  const Row = ({ address, net, transfers }: { address: string; net: bigint; transfers: number }) => (
    <tr className="border-b border-rule-faint last:border-0">
      <td className="px-4 py-2 font-mono text-data-s text-ink-muted">
        <Link href={`/wallet/${address}`} className="hover:text-ink">
          {shortAddress(address, 8, 6)}
        </Link>
      </td>
      <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink">{units(net)}</td>
      <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink-faint">{transfers}</td>
    </tr>
  );

  return (
    <section className="border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="label text-ink-muted">OBSERVED OWNERSHIP</h2>
        <span className="label-s text-ink-faint">{ownership.coverage} COVERAGE</span>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-rule-faint px-4 py-3 sm:grid-cols-4">
        {[
          ["ADDRESSES SEEN", ownership.observedAddresses.toLocaleString("en-US")],
          ["TRANSFERS READ", ownership.transfersConsidered.toLocaleString("en-US")],
          ["MINTED IN WINDOW", units(ownership.mintedInWindow)],
          ["BURNED IN WINDOW", units(ownership.burnedInWindow)],
        ].map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="label-s text-ink-faint">{term}</dt>
            <dd className="truncate font-mono text-data-s text-ink-muted">{value}</dd>
          </div>
        ))}
      </dl>

      {ownership.topAccumulating.length ? (
        <div className="overflow-x-auto border-b border-rule-faint">
          <table className="w-full min-w-[420px] border-collapse">
            <caption className="label-s px-4 pt-2.5 pb-1 text-left text-ink-faint">
              LARGEST NET INCREASE · {symbol}
            </caption>
            <thead>
              <tr className="border-b border-rule-faint">
                <th className="label-s px-4 py-2 text-left font-normal text-ink-faint">ADDRESS</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">NET CHANGE</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">TRANSFERS</th>
              </tr>
            </thead>
            <tbody>
              {ownership.topAccumulating.slice(0, 6).map((p) => (
                <Row key={p.address} address={p.address} net={p.netChange} transfers={p.transfers} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {ownership.topDistributing.length ? (
        <div className="overflow-x-auto border-b border-rule-faint">
          <table className="w-full min-w-[420px] border-collapse">
            <caption className="label-s px-4 pt-2.5 pb-1 text-left text-ink-faint">
              LARGEST NET DECREASE · {symbol}
            </caption>
            <thead>
              <tr className="border-b border-rule-faint">
                <th className="label-s px-4 py-2 text-left font-normal text-ink-faint">ADDRESS</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">NET CHANGE</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">TRANSFERS</th>
              </tr>
            </thead>
            <tbody>
              {ownership.topDistributing.slice(0, 6).map((p) => (
                <Row key={p.address} address={p.address} net={p.netChange} transfers={p.transfers} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="label-s px-4 py-2.5 normal-case tracking-[0.02em] text-ink-faint">
        {ownership.coverageNote} No holder count, rank or share of supply is shown, because those require history
        reaching this asset&apos;s first transfer. An address may also be a pool or a contract; nothing here claims a
        participant is a person.
      </p>
    </section>
  );
}
