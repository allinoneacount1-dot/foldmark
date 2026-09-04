/**
 * Market enrichment.
 *
 * SERVER ONLY. Walks FOLDMARK's real assets, asks the provider for pools
 * holding each exact contract, and persists what came back.
 *
 * This is a SEPARATE pipeline from chain ingestion. It has its own state and
 * never touches the chain cursor: a provider outage must not be able to stall
 * the index, and a chain reorg must not invalidate a price observation.
 *
 * WHAT IT WRITES, and why into these tables. No DDL is reachable on this
 * deployment, so enrichment uses the columns that already mean the right thing
 * rather than inventing meanings for ones that do not:
 *
 *   prices           one row per asset per pass — the featured DEX_SPOT price,
 *                    with the pool it came from named in `source`.
 *   asset_metadata   the full normalized market set as JSON, which is what that
 *                    jsonb column is for. Every pool, its venue, price,
 *                    liquidity and volume, kept separate rather than collapsed.
 *   contracts        discovered pool addresses, typed `dex_pool`. This is the
 *                    registry the flow classifier and the topology already
 *                    read, so a real pool becomes a VENUE node and its
 *                    transfers become DEX_BUY / DEX_SELL — earned by evidence,
 *                    not inferred from behaviour.
 *
 * `verified` stays false on every row written here. A provider listing a market
 * is not an issuer confirming a contract, and that distinction is the whole
 * reason the earlier verification defect happened.
 */

import { poolsForContract, primaryMarket, providerAvailable, NETWORK_ID, type MarketObservation } from "@/server/market/geckoterminal";
import { selectRows, upsertRows, insertIgnoreDuplicates } from "@/server/db/supabase";
import { CHAIN } from "@/config/site";

export type AssetMappingStatus = "MATCHED" | "NO_MATCH" | "AMBIGUOUS" | "ERROR" | "RATE_LIMITED";

export type EnrichReport = {
  ok: boolean;
  provider: string;
  network: string;
  assetsQueried: number;
  assetsMatched: number;
  assetsWithMarkets: number;
  assetsWithoutMarkets: number;
  ambiguous: number;
  errors: number;
  rateLimited: number;
  pairsDiscovered: number;
  priceObservationsWritten: number;
  poolContractsRegistered: number;
  protocolsRegistered: number;
  requests: number;
  durationMs: number;
  sample: (MarketObservation & { assetSymbol: string; assetContract: string }) | null;
  perAsset: { symbol: string; contract: string; status: AssetMappingStatus; pools: number }[];
};

type AssetRow = { id: string; symbol: string; contract_address: string };

/**
 * One enrichment pass.
 *
 * Bounded by both a deadline and an asset budget: the provider paces requests,
 * so a pass over many assets takes real time and must finish inside the hosted
 * function's limit rather than being killed part-way.
 */
export async function runEnrichPass(
  opts: { assetBudget?: number; deadlineMs?: number } = {},
): Promise<EnrichReport> {
  const started = Date.now();
  const deadline = started + (opts.deadlineMs ?? 45_000);

  const report: EnrichReport = {
    ok: false,
    provider: "GeckoTerminal",
    network: NETWORK_ID,
    assetsQueried: 0,
    assetsMatched: 0,
    assetsWithMarkets: 0,
    assetsWithoutMarkets: 0,
    ambiguous: 0,
    errors: 0,
    rateLimited: 0,
    pairsDiscovered: 0,
    priceObservationsWritten: 0,
    poolContractsRegistered: 0,
    protocolsRegistered: 0,
    requests: 0,
    durationMs: 0,
    sample: null,
    perAsset: [],
  };

  const assets = await selectRows<AssetRow>(
    "assets",
    `select=id,symbol,contract_address&chain_id=eq.${CHAIN.id}&order=symbol.asc`,
  );
  if (!assets) {
    report.durationMs = Date.now() - started;
    return report;
  }

  const budget = opts.assetBudget ?? 6;
  const queue = assets.slice(0, budget);

  const priceRows: Record<string, unknown>[] = [];
  const metadataRows: Record<string, unknown>[] = [];
  const contractRows: Record<string, unknown>[] = [];
  const seenPools = new Set<string>();
  /** Provider-reported venue ids seen on real EVM pools, and their pool counts. */
  const venues = new Map<string, number>();

  for (const asset of queue) {
    if (Date.now() > deadline) break;
    if (!providerAvailable()) {
      report.rateLimited += 1;
      report.perAsset.push({ symbol: asset.symbol, contract: asset.contract_address, status: "RATE_LIMITED", pools: 0 });
      continue;
    }

    report.assetsQueried += 1;
    report.requests += 1;
    const result = await poolsForContract(asset.contract_address);

    if (result.status === "RATE_LIMITED") {
      report.rateLimited += 1;
      report.perAsset.push({ symbol: asset.symbol, contract: asset.contract_address, status: "RATE_LIMITED", pools: 0 });
      continue;
    }
    if (result.status === "ERROR") {
      report.errors += 1;
      report.perAsset.push({ symbol: asset.symbol, contract: asset.contract_address, status: "ERROR", pools: 0 });
      continue;
    }
    if (result.status === "NO_MATCH") {
      report.assetsWithoutMarkets += 1;
      report.perAsset.push({ symbol: asset.symbol, contract: asset.contract_address, status: "NO_MATCH", pools: 0 });
      /**
       * A negative result is recorded too.
       *
       * "We asked and there is no market" is a measurement, and storing it stops
       * the next pass asking again immediately. It is not the same as "we have
       * not looked", which is what an absent row means.
       */
      metadataRows.push({
        asset_id: asset.id,
        metadata_json: {
          market: {
            provider: "GeckoTerminal",
            network: NETWORK_ID,
            mapping_status: "NO_MATCH",
            markets: [],
            checked_at: new Date().toISOString(),
          },
        },
        source: "GeckoTerminal",
        observed_at: new Date().toISOString(),
      });
      continue;
    }

    // MATCHED
    report.assetsMatched += 1;
    const markets = result.markets;
    report.assetsWithMarkets += 1;
    report.pairsDiscovered += markets.length;
    report.perAsset.push({ symbol: asset.symbol, contract: asset.contract_address, status: "MATCHED", pools: markets.length });

    const featured = primaryMarket(markets);
    if (featured) {
      if (!report.sample) {
        report.sample = { ...featured, assetSymbol: asset.symbol, assetContract: asset.contract_address };
      }
      priceRows.push({
        asset_id: asset.id,
        price: featured.priceUsd,
        currency: "USD",
        /**
         * Provenance, stated in full. The kind of price, the provider, and the
         * exact pool it came from — so a reader can tell a DEX spot price from
         * a reference chart without leaving the row.
         */
        source: `DEX_SPOT · GeckoTerminal · ${featured.venue} · pool ${featured.pairAddress}`,
        observed_at: featured.observedAt,
      });
    }

    metadataRows.push({
      asset_id: asset.id,
      metadata_json: {
        market: {
          provider: "GeckoTerminal",
          network: NETWORK_ID,
          mapping_status: "MATCHED",
          price_type: "DEX_SPOT",
          primary: featured
            ? {
                pair_address: featured.pairAddress,
                pair_name: featured.pairName,
                venue: featured.venue,
                price_usd: featured.priceUsd,
                side: featured.side,
                liquidity_usd: featured.reserveUsd,
                volume_24h_usd: featured.volume24hUsd,
              }
            : null,
          markets: markets.map((m) => ({
            pair_address: m.pairAddress,
            pair_name: m.pairName,
            venue: m.venue,
            price_usd: m.priceUsd,
            side: m.side,
            counter_contract: m.counterContract,
            liquidity_usd: m.reserveUsd,
            volume_24h_usd: m.volume24hUsd,
          })),
          checked_at: new Date().toISOString(),
        },
      },
      source: "GeckoTerminal",
      observed_at: featured?.observedAt ?? new Date().toISOString(),
    });

    /**
     * Register the pools as venue contracts.
     *
     * This is the part that changes the rest of the product: the classifier and
     * the topology both read `contracts`, so a pool recorded here turns an
     * anonymous address node into a VENUE and lets its transfers resolve to
     * DEX_BUY or DEX_SELL. `verified` stays false — a listing is not an issuer
     * confirmation, and only evidence of that kind may set it.
     */
    for (const m of markets) {
      if (seenPools.has(m.pairAddress)) continue;
      seenPools.add(m.pairAddress);
      /**
       * Only real EVM addresses enter the registry.
       *
       * Some venues identify a pool with something that is not an account —
       * Balancer-style ids are 32 bytes, not 20. Those are real provider data
       * and are kept in the market metadata, but they can never equal an
       * address appearing in a Transfer log, so putting them in the registry
       * the classifier reads would add rows that match nothing and dilute a
       * table whose whole purpose is identity.
       */
      if (!/^0x[0-9a-f]{40}$/.test(m.pairAddress)) continue;
      venues.set(m.venue, (venues.get(m.venue) ?? 0) + 1);
      contractRows.push({
        address: m.pairAddress,
        contract_type: "dex_pool",
        /**
         * The venue the provider reported, used as the protocol id.
         *
         * This links a pool to the venue operating it, which is what turns a
         * list of anonymous pool addresses into a protocol with contracts. The
         * id is the provider's own identifier, kept verbatim so the claim
         * stays traceable to who made it.
         */
        protocol_id: m.venue,
        verified: false,
      });
    }
  }

  // ---- persist ----------------------------------------------------------
  if (priceRows.length) {
    const res = await insertIgnoreDuplicates("prices", priceRows);
    if (res.ok) report.priceObservationsWritten = res.inserted || priceRows.length;
  }
  if (metadataRows.length) {
    await upsertRows("asset_metadata", metadataRows, "asset_id");
  }
  /**
   * Protocols are written BEFORE the contracts that reference them, because
   * contracts.protocol_id is a foreign key and an ordering mistake here would
   * silently drop every link.
   *
   * category is DEX because the evidence is a DEX aggregator reporting pools.
   * verified stays FALSE: a provider naming a venue is not an authoritative
   * source confirming what that venue is, and collapsing those two would repeat
   * the defect that put a false VERIFIED badge on fourteen assets.
   */
  if (venues.size) {
    const protocolRows = [...venues.keys()].map((venue) => ({
      id: venue,
      // The provider's own identifier, verbatim. Not a name FOLDMARK invented.
      name: venue,
      category: "DEX",
      verified: false,
    }));
    const ok = await upsertRows("protocols", protocolRows, "id");
    if (ok) report.protocolsRegistered = protocolRows.length;
  }

  if (contractRows.length) {
    const ok = await upsertRows("contracts", contractRows, "address");
    if (ok) report.poolContractsRegistered = contractRows.length;
  }

  report.ok = report.assetsQueried > 0 && report.errors < report.assetsQueried;
  report.durationMs = Date.now() - started;
  return report;
}
