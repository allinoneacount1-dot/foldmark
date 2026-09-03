import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { StateTag } from "@/components/ui/primitives";
import { SOURCES, DEFINITIONS, KIND_LABEL, type Definition } from "@/content/docs";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Data sources",
  description: "Every source FOLDMARK reads, its freshness, its trust level and what happens when it fails.",
};

const KIND_ORDER: Definition["kind"][] = ["RAW", "DERIVED", "INTERPRETED", "UNAVAILABLE"];

export default function DataSourcesPage() {
  return (
    <article>
      <DocTitle
        kicker="DATA"
        title="Data sources and provenance"
        lede="What FOLDMARK reads, how fresh it is, how far it can be trusted, and what the product does when a source fails. A source that is not wired is marked PLANNED; one that is implemented but switched off in this deployment is marked DISABLED. Neither is ever presented as live."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="sources" title="Sources">
          <div className="flex flex-col gap-px bg-rule">
            {SOURCES.map((s) => (
              <div key={s.name} className="bg-void p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-mono text-data text-ink">{s.name}</h3>
                  <StateTag
                    state={s.status === "LIVE" ? "OK" : s.status === "DISABLED" ? "UNAVAILABLE" : "INDEXING"}
                    label={s.status}
                  />
                </div>
                <p className="mt-2 max-w-[68ch] text-body-s text-ink-muted">{s.purpose}</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  <div>
                    <dt className="label-s">DATA TYPE</dt>
                    <dd className="mt-0.5 text-body-s text-ink-muted">{s.dataType}</dd>
                  </div>
                  <div>
                    <dt className="label-s">FRESHNESS</dt>
                    <dd className="mt-0.5 text-body-s text-ink-muted">{s.freshness}</dd>
                  </div>
                  <div>
                    <dt className="label-s">ON FAILURE</dt>
                    <dd className="mt-0.5 text-body-s text-ink-faint">{s.fallback}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <Note tone="warn">
            Only sources actually wired into this deployment are marked LIVE. A price oracle and a verified protocol
            contract registry would each unlock a large part of the product — neither exists on chain {CHAIN.id} today,
            so both are PLANNED and every field that depends on them reads a state.
          </Note>
        </DocSection>

        <DocSection id="path" title="How an observation reaches the screen">
          <P>
            Every figure travels the same path, and each hop is a place a number can be lost — never a place one can
            be invented.
          </P>
          <List
            items={[
              `The chain is read over ${CHAIN.name} RPC, with a newHeads subscription over WebSocket for the head.`,
              "A persistent runner — scripts/live-indexer.mjs, installed as a Windows scheduled task — follows that head and calls the deployment's ingest route. It is the primary writer, because the free endpoint retains only about 48 blocks of logs and anything not taken within seconds of being emitted is gone for good.",
              "The ingest route reads logs and provider prices, normalises them, and writes them to Neon Postgres as parameterised SQL keyed so that a replay cannot double count.",
              "A Vercel cron calls the same route once a day. It is a fallback that keeps prices and asset discovery moving; it cannot hold a five-second log window, so a deployment running only the cron reports gapped chain coverage rather than a smooth line.",
              "Vercel serves the pages and the API by reading that database through one server-side client. The browser never reaches storage or the RPC directly, and no database credential exists outside the deployment.",
            ]}
          />
          <Note>
            Storage is not a source. It holds what was measured, with the time it was measured attached — which is why
            a stale row reads STALE instead of quietly standing in for a fresh one.
          </Note>
        </DocSection>

        <DocSection id="trust" title="Trust levels">
          <P>
            Not every value carries the same weight of evidence. FOLDMARK separates four kinds so a reader can tell
            an observation from a computation from an interpretation.
          </P>
          <DocTable
            caption="Trust levels"
            columns={["KIND", "MEANING", "EXAMPLE"]}
            rows={[
              ["RAW", "Directly observed on chain. The strongest claim FOLDMARK makes.", "A Transfer log, a block timestamp, a contract's decimals()."],
              ["DERIVED", "Computed from observed data by a rule stated in the methodology.", "Gross volume, counterparty count, net flow per address."],
              ["INTERPRETED", "Rule-based context that depends on a registry being populated.", "Flow classification, protocol exposure."],
              [
                "UNAVAILABLE",
                "Not measurable in this deployment. Withheld, never estimated.",
                "Issuer reference price, oracle price, holder counts.",
              ],
            ]}
          />
        </DocSection>

        <DocSection id="provenance" title="Provenance">
          <P>
            Every measurement in the product carries its source with it. In the interface that appears beneath the
            value; in the API it appears in the response body. The same information reaches a human and a machine.
          </P>
          <DocTable
            caption="Provenance by field"
            columns={["FIELD", "SOURCE", "KIND"]}
            rows={[
              ["Transfer, sender, recipient, amount", `${CHAIN.name} RPC — eth_getLogs, Transfer topic`, "RAW"],
              ["Timestamp", "Block header — eth_getBlockByNumber", "RAW"],
              ["Asset identity, decimals", "On-chain contract metadata — name(), symbol(), decimals()", "RAW"],
              ["Chain head", `${CHAIN.name} RPC — eth_blockNumber`, "RAW"],
              ["Gross volume, counterparties, activity", "Folded from the transfers above", "DERIVED"],
              ["Net flow per address", "Folded from the transfers above", "DERIVED"],
              ["Market topology", "Folded from the transfers above", "DERIVED"],
              ["Flow classification", "Contracts registry — empty in this deployment", "INTERPRETED"],
              ["Price", "DEX pool quote — GeckoTerminal, stored with its fetch time and the pool behind it", "DERIVED"],
              ["Liquidity", "Pool reserve as reported alongside that quote — not depth at a size", "DERIVED"],
              [
                "Issuer reference price, oracle price",
                `No Robinhood price API answered from this deployment, and no Chainlink aggregator is verified for chain ${CHAIN.id}`,
                "UNAVAILABLE",
              ],
              ["Holders, markets", "No venue registry, and a rolling window rather than full history", "UNAVAILABLE"],
            ]}
          />
        </DocSection>

        <DocSection id="raw-vs-derived" title="Raw against derived, field by field">
          <P>
            The complete classification of every metric the product publishes. The computation behind each one is in{" "}
            <Link href="/docs/methodology" className="text-ink underline-offset-4 hover:underline">
              Methodology
            </Link>
            .
          </P>
          {KIND_ORDER.map((kind) => {
            const items = DEFINITIONS.filter((d) => d.kind === kind);
            if (!items.length) return null;
            return (
              <div key={kind}>
                <p className="label-s border-b border-rule pb-2">{KIND_LABEL[kind]}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {items.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/docs/methodology#${d.id}`}
                        className="inline-block border border-rule px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted m-fast hover:border-rule-strong hover:text-ink"
                      >
                        {d.term}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </DocSection>

        <DocSection id="failure" title="Failure behaviour">
          <P>FOLDMARK fails closed. A source that cannot answer produces a state, never a substitute value.</P>
          <List
            items={[
              "RPC unreachable → chain head reads DATA UNAVAILABLE, and /api/v1/network answers 503. The rest of the product still serves what storage holds, clearly marked with its lag.",
              "Postgres unreachable, or DATABASE_URL unset → every dependent figure reads DATA UNAVAILABLE. Nothing throws and no cached approximation is served in its place, which is also how a fresh clone builds and runs with no secrets.",
              "The persistent runner stopped → chain indexing stops advancing and the missed span is recorded as a gap. Windows then report PARTIAL with the reach they actually have; no block is invented to bridge it, because the logs are already outside the endpoint's window.",
              "A window that hits its row cap → the result is reported PARTIAL and every count is a lower bound.",
              "An observation older than fifteen minutes → the value is marked STALE rather than presented as current.",
              "A counterparty that cannot be identified → the flow is returned UNCLASSIFIED rather than guessed.",
            ]}
          />
          <Note>
            The current health of every dependency is on the{" "}
            <Link href="/docs/status" className="text-ink underline-offset-4 hover:underline">
              status page
            </Link>
            , measured live rather than reported from a static list.
          </Note>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/data-sources" />
    </article>
  );
}
