import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { GLOSSARY } from "@/content/docs";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Core concepts",
  description: "Asset, wallet, protocol, market, relationship, counterparty, capital flow, liquidity, activity and fabric — defined, sourced and bounded.",
};

type Concept = {
  id: string;
  term: string;
  definition: string;
  supportedBy: string;
  usedFor: string;
  limits: string;
};

const CONCEPTS: Concept[] = [
  {
    id: "asset",
    term: "Asset",
    definition: "A token contract the indexer has observed emitting an ERC-20 Transfer log.",
    supportedBy: "Transfer logs for identity of existence; name(), symbol() and decimals() read on-chain for identity of record.",
    usedFor: "The registry, the passport, the centre lane of the topology, and every per-asset aggregate.",
    limits: "An asset that has not transferred inside the indexed range does not exist to FOLDMARK. Absence here is a statement about the index, not about the contract.",
  },
  {
    id: "wallet",
    term: "Wallet",
    definition: "Any address observed as the sender or the recipient of a transfer.",
    supportedBy: "The from and to fields of Transfer logs, plus a last-seen timestamp.",
    usedFor: "Wallet pages, counterparty ledgers, and the outer lanes of the topology.",
    limits: "The word carries no identity claim. FOLDMARK cannot tell a person from a contract from a custodian, and never attributes an address to a real-world identity.",
  },
  {
    id: "protocol",
    term: "Protocol",
    definition: "Named infrastructure whose contracts are registered and verified.",
    supportedBy: "The protocols and contracts registries. Nothing else.",
    usedFor: "Protocol pages, protocol exposure, and flow classification.",
    limits: `No protocol is verified on chain ${CHAIN.id} yet, so the registry is empty. FOLDMARK will not promote an address to a named protocol on the basis of behaviour alone.`,
  },
  {
    id: "market",
    term: "Market",
    definition: "A venue where an asset trades.",
    supportedBy: "Would require a verified venue contract.",
    usedFor: "Would populate market counts on the passport and venue nodes in the graph.",
    limits: "No venue contract is registered on this chain, so every market field is withheld rather than estimated.",
  },
  {
    id: "relationship",
    term: "Relationship",
    definition: "A directed pair of entities connected by observed value movement.",
    supportedBy: "Transfers folded into (sender, recipient, asset) edges with a summed amount and a transfer count.",
    usedFor: "Graph edges, top flows, counterparty ledgers, and the structure-change measure.",
    limits: "A relationship proves that value moved. It does not prove intent, ownership or affiliation.",
  },
  {
    id: "counterparty",
    term: "Counterparty",
    definition: "The other address in a transfer, from the perspective of the entity being viewed.",
    supportedBy: "The opposite side of each Transfer log in the window.",
    usedFor: "Counterparty counts and ledgers on assets, wallets and protocols.",
    limits: "A counterparty count is not a holder count. It counts participation in the window, not ownership.",
  },
  {
    id: "capital-flow",
    term: "Capital flow",
    definition: "Value moving between addresses, directed from sender to recipient.",
    supportedBy: "Transfer amounts converted to token units at each asset's own decimals.",
    usedFor: "The flow observatory, the intelligence rail, per-address net flow.",
    limits: "Amounts are token units and are never summed across different assets — adding units of different tokens would be meaningless. No currency conversion exists in this deployment.",
  },
  {
    id: "liquidity",
    term: "Liquidity",
    definition: "Depth available to trade an asset.",
    supportedBy: "Would require identified pool contracts and their reserves.",
    usedFor: "Would populate liquidity fields on the passport and the rail.",
    limits: "Not measurable here. Every liquidity field reads DATA UNAVAILABLE.",
  },
  {
    id: "activity",
    term: "Activity",
    definition: "How much happened around an entity inside a window.",
    supportedBy: "Transfer counts, gross volume, distinct counterparties and per-interval buckets.",
    usedFor: "Sparklines, histograms, ranking, node radius.",
    limits: "Activity is descriptive. It says a thing happened often, not that it was significant, and never that it will continue.",
  },
  {
    id: "fabric",
    term: "Fabric",
    definition: "The whole market rendered as a network of entities and their relationships.",
    supportedBy: "The union of every folded edge in the window, ranked by observed value.",
    usedFor: "The /fabric surface, and the embedded graphs on the dashboard, passports and wallet pages.",
    limits: "The view is capped for legibility. When it is, the count shown and the count held are both published so the truncation is visible.",
  },
];

export default function ConceptsPage() {
  return (
    <article>
      <DocTitle
        kicker="CONCEPTS"
        title="Core concepts"
        lede="Every term FOLDMARK uses, with the data that supports it, what it drives in the product, and where it stops. If a concept is not measurable in this deployment, that is stated here rather than implied by an empty field."
      />

      <div className="mt-12 flex flex-col gap-10">
        {CONCEPTS.map((c) => (
          <DocSection key={c.id} id={c.id} title={c.term}>
            <P>{c.definition}</P>
            <DocTable
              caption={`${c.term} — support, use and limits`}
              columns={["", ""]}
              rows={[
                [<span key="a" className="label-s">SUPPORTED BY</span>, c.supportedBy],
                [<span key="b" className="label-s">USED FOR</span>, c.usedFor],
                [<span key="c" className="label-s">LIMITS</span>, <span key="d" className="text-ink-faint">{c.limits}</span>],
              ]}
            />
          </DocSection>
        ))}

        <DocSection id="glossary" title="Glossary">
          <P>Short forms of the above, plus the operational vocabulary used across the interface and the API.</P>
          <dl className="border border-rule">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="border-b border-rule-faint px-4 py-3 last:border-b-0">
                <dt className="label text-ink">{g.term}</dt>
                <dd className="mt-1 text-body-s text-ink-muted">{g.definition}</dd>
              </div>
            ))}
          </dl>
          <Note>
            <List
              items={[
                <>
                  Terms that describe a computation are defined precisely in{" "}
                  <Link href="/docs/methodology" className="text-ink underline-offset-4 hover:underline">
                    Methodology
                  </Link>
                  .
                </>,
                <>
                  Terms that depend on a registry are bounded in{" "}
                  <Link href="/docs/limitations" className="text-ink underline-offset-4 hover:underline">
                    Limitations
                  </Link>
                  .
                </>,
              ]}
            />
          </Note>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/concepts" />
    </article>
  );
}
