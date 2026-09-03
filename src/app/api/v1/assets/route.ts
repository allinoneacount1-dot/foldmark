import { NextResponse } from "next/server";
import { getAssets, getWindowActivity, getLatestPrices, foldByAsset } from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** The asset registry as the index actually holds it. No fallback list. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";

  const now = Date.now();
  const [{ state, rows }, activity] = await Promise.all([getAssets(), getWindowActivity(window, now)]);

  if (!rows.length) {
    return NextResponse.json({
      assets: [],
      count: 0,
      state,
      chain_id: CHAIN.id,
      updated_at: new Date().toISOString(),
      methodology:
        "An asset enters the registry when the indexer observes an ERC-20 Transfer for its contract. A Stock Token is identified from its canonical on-chain name, never from its symbol. No asset is seeded.",
    });
  }

  const folded = foldByAsset(activity.rows, rows, window, now);
  const prices = await getLatestPrices(rows.map((a) => a.id));

  return NextResponse.json({
    assets: rows.map((a) => {
      const act = folded.get(a.id);
      const price = prices.get(a.id);
      return {
        symbol: a.symbol,
        name: a.name,
        contract: a.contract_address,
        type: a.asset_type,
        decimals: a.decimals,
        verified: a.verified,
        source: a.source,
        price: price ? { value: price.price, source: price.source, observed_at: price.observedAt } : { state: "DATA UNAVAILABLE" },
        activity: act
          ? {
              window,
              transfers: act.transfers,
              gross_volume: Number(act.volume.toFixed(6)),
              counterparties: act.counterparties,
              last_block: act.lastBlock,
              last_seen: act.lastSeen,
            }
          : { window, state: "NO ACTIVITY", transfers: 0 },
      };
    }),
    count: rows.length,
    state,
    chain_id: CHAIN.id,
    window,
    activity_state: activity.state,
    updated_at: new Date().toISOString(),
    methodology:
      "Activity is folded from ERC-20 Transfer logs stamped with block time. Gross volume sums transfer amounts in token units; it is not a net flow and not a currency figure.",
  });
}
