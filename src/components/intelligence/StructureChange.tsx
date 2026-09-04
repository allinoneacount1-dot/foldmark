import Link from "next/link";
import { shortAddress } from "@/lib/format";
import type { FlowIntelligence } from "@/server/flows/intelligence";

/**
 * What changed between this window and the one before it.
 *
 * Every row shows both numbers it was derived from. That is deliberate: a
 * percentage on its own invites a reader to treat it as a signal, and a change
 * from one transfer to three is a 200% increase that means almost nothing.
 * Showing the pair keeps the reader's judgement attached to the evidence.
 *
 * Nothing here is scored, rated or flagged as unusual. FOLDMARK reports what
 * moved; deciding whether that matters needs a baseline it has not established.
 */
export function StructureChange({ intel }: { intel: FlowIntelligence }) {
  const moved = intel.deltas.filter((d) => d.change !== 0);

  return (
    <section className="border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="label text-ink-muted">STRUCTURE CHANGE · {intel.window}</h2>
        <span className="label-s text-ink-faint">VS PREVIOUS {intel.window}</span>
      </header>

      {moved.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr className="border-b border-rule-faint">
                <th className="label-s px-4 py-2 text-left font-normal text-ink-faint">METRIC</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">PREVIOUS</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">CURRENT</th>
                <th className="label-s px-4 py-2 text-right font-normal text-ink-faint">CHANGE</th>
              </tr>
            </thead>
            <tbody>
              {moved.slice(0, 10).map((d) => (
                <tr key={d.metric} className="border-b border-rule-faint last:border-0">
                  <td className="px-4 py-2 font-mono text-data-s text-ink-muted">{d.metric}</td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink-faint">
                    {d.previous.toLocaleString("en-US")}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink">
                    {d.current.toLocaleString("en-US")}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink-muted">
                    {d.change > 0 ? "+" : ""}
                    {d.change.toLocaleString("en-US")}
                    {d.changeRatio === null ? "" : ` (${d.changeRatio > 0 ? "+" : ""}${Math.round(d.changeRatio * 100)}%)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-body-s text-ink-muted">
          Nothing measured differs between this window and the one before it.
        </p>
      )}

      {intel.topAssets.length ? (
        <div className="border-t border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">MOST ACTIVE ASSETS · BY TRANSFERS</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            {intel.topAssets.slice(0, 6).map((a) => (
              <li key={a.assetId} className="font-mono text-data-s text-ink-muted">
                <span className="text-ink">{a.symbol}</span> {a.transfers.toLocaleString("en-US")} tx ·{" "}
                {a.counterparties.toLocaleString("en-US")} addresses
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intel.topVenues.length ? (
        <div className="border-t border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">IDENTIFIED VENUES IN WINDOW</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            {intel.topVenues.map((v) => (
              <li key={v.address} className="font-mono text-data-s text-ink-muted">
                <Link href={`/wallet/${v.address}`} className="hover:text-ink">
                  {shortAddress(v.address, 6, 4)}
                </Link>{" "}
                {v.protocolId ? <span className="text-ink-faint">{v.protocolId}</span> : null}{" "}
                {v.transfers.toLocaleString("en-US")} tx
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="label-s border-t border-rule-faint px-4 py-2.5 normal-case tracking-[0.02em] text-ink-faint">
        {intel.coverageNote} Nothing here is scored or flagged as unusual: both numbers behind every change are shown
        so the judgement stays with the reader.
      </p>
    </section>
  );
}
