import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { getAssets } from "@/lib/queries";
import { integer } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Stock Tokens",
  description: "How FOLDMARK identifies a Robinhood Stock Token, and why matching on a symbol is not sufficient.",
};

export const revalidate = 300;

export default async function StockTokensPage() {
  const { rows, state } = await getAssets();
  const stockTokens = rows.filter((a) => a.asset_type === "stock_token");

  return (
    <article>
      <DocTitle
        kicker="CONCEPTS"
        title="Stock Tokens"
        lede="A Stock Token is identified from its canonical on-chain contract metadata. FOLDMARK never infers one from a ticker symbol, and never calls it anything other than a Stock Token."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="terminology" title="Terminology">
          <P>
            The canonical label is <strong className="text-ink">STOCK TOKEN</strong>. FOLDMARK does not use
            &ldquo;tokenized stock&rdquo;, &ldquo;tokenized equity&rdquo; or any variation, in the interface, in API
            responses or in documentation.
          </P>
          <Note>
            This is a naming rule, not a legal opinion. FOLDMARK is an independent analytics application and is not
            affiliated with, endorsed by or operated by Robinhood Markets, Inc.
          </Note>
        </DocSection>

        <DocSection id="verification" title="How a Stock Token is verified">
          <P>
            During indexing, any contract that emits a Transfer and is not already tracked is read directly on-chain.
            The contract is registered as a Stock Token only when its own <code className="font-mono text-ink">name()</code>{" "}
            carries the canonical Robinhood Token marker.
          </P>
          <CodeBlock
            language="ts"
            caption="src/lib/indexer.ts — the identification rule"
            code={`const STOCK_TOKEN_NAME_MARKER = "robinhood token";

const [symbol, name] = await Promise.all([
  client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
  client.readContract({ address, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
]);

if (!symbol || !name) continue;                                    // not an ERC-20 we can identify
if (!String(name).toLowerCase().includes(STOCK_TOKEN_NAME_MARKER)) continue;  // not a Stock Token

// only now is it registered, with its own decimals and a recorded provenance string`}
          />
          <List
            items={[
              "The read is a direct eth_call against the contract. No list, no third-party registry, no manual entry.",
              "A contract that does not answer the ERC-20 view calls is simply not registered as an asset.",
              "decimals() is read from the contract too, so amounts are always converted at the token's own precision.",
              "The provenance string stored on the row records that the classification came from on-chain metadata.",
            ]}
          />
        </DocSection>

        <DocSection id="why-not-symbols" title="Why a symbol is not enough">
          <P>
            A ticker is not a unique key on a public chain. Anyone can deploy a contract whose{" "}
            <code className="font-mono text-ink">symbol()</code> returns a well-known ticker, and nothing prevents two
            unrelated contracts from claiming the same one.
          </P>
          <List
            items={[
              "Symbols are attacker-controlled: a lookalike contract is trivially deployable.",
              "Symbols collide: the same three or four letters can appear on many unrelated contracts.",
              "Symbols carry no issuer information, so they cannot establish that a contract is canonical.",
              "The contract address is the only durable identity, and canonical name metadata is the only evidence that ties it to an issuer.",
            ]}
          />
          <Note tone="warn">
            Because of this, FOLDMARK addresses every asset by its contract address throughout the product and the API.
            Symbols are shown for readability and accepted as a convenience lookup, but identity is always the address.
          </Note>
        </DocSection>

        <DocSection id="fields" title="What is recorded, and what is not">
          <P>
            A registered Stock Token carries only what was actually read or observed. Corporate-action handling —
            splits, multipliers, dividends — is <strong className="text-ink">not implemented</strong>, so no field
            claims to account for it.
          </P>
          <List
            items={[
              <>
                <strong className="text-ink">Recorded</strong>: contract address, symbol, canonical name, decimals,
                asset type, verification flag, and the provenance of the classification.
              </>,
              <>
                <strong className="text-ink">Observed</strong>: transfers, gross volume, counterparties and per-interval
                activity across every window.
              </>,
              <>
                <strong className="text-ink">Observed from markets</strong>: DEX_SPOT price, per-pool liquidity and 24h
                volume, from pools holding the exact contract. No oracle is involved; chain {CHAIN.id} has none.
              </>,
              <>
                <strong className="text-ink">Withheld</strong>: holders — requires full-history balance reconstruction;
                portfolio value — requires balances the head-following index never saw; a per-window price series — a
                transfer is valued only by an observation at or before it, and most have none.
              </>,
              <>
                <strong className="text-ink">Not implemented</strong>: multiplier and corporate-action adjustment. No
                field is silently adjusted for them.
              </>,
            ]}
          />
        </DocSection>

        <DocSection id="current" title="What the index holds right now">
          <P>
            {stockTokens.length
              ? `${integer(stockTokens.length)} contract${stockTokens.length === 1 ? " is" : "s are"} registered as a Stock Token on chain ${CHAIN.id}, out of ${integer(rows.length)} indexed asset${rows.length === 1 ? "" : "s"}.`
              : state === "UNAVAILABLE"
                ? "The index is unreachable from this deployment, so no count can be given."
                : `No Stock Token has been registered on chain ${CHAIN.id} yet. Discovery runs on every indexer pass; the registry fills as contracts emit their first Transfer.`}
          </P>
          <P>
            The live list is in the{" "}
            <Link href="/assets?type=stock_token" className="text-ink underline-offset-4 hover:underline">
              asset registry
            </Link>
            , filtered to Stock Tokens.
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/stock-tokens" />
    </article>
  );
}
