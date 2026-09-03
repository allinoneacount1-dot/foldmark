import { NextResponse } from "next/server";
import { getAssetByAddress, getTransfersSince, since } from "@/lib/queries";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { aggregateCandles, aggregateVolume, defaultInterval, supportedIntervals, INTERVALS, type Interval } from "@/lib/ohlc";
import { fromBaseUnits } from "@/lib/format";
import { WINDOWS, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/**
 * Chart data for one asset.
 *
 * Two series can be served, and the response always says which one it is:
 *
 *   series = "price"    real OHLC aggregated from the prices table
 *   series = "activity" observed transfer volume and count — NOT price
 *
 * When no price observation exists the endpoint returns series "activity" with
 * price_state INDEXING. It never synthesises candles.
 */
export async function GET(req: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const { searchParams } = new URL(req.url);

  const requestedInterval = searchParams.get("interval") as Interval | null;
  const requestedRange = (searchParams.get("range") as FlowWindow | null) ?? "7D";
  const range: FlowWindow = WINDOWS.includes(requestedRange) ? requestedRange : "7D";

  const asset = await getAssetByAddress(contract);
  if (!asset) {
    return NextResponse.json(
      { error: "ASSET_NOT_INDEXED", contract, methodology: "Assets appear once the indexer observes a Transfer log for the contract." },
      { status: 404 },
    );
  }

  const now = Date.now();
  const from = since(range, now);

  // --- price observations -------------------------------------------------
  let priceRows: { price: number; observed_at: string; source: string }[] = [];
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from("prices")
      .select("price, observed_at, source")
      .eq("asset_id", asset.id)
      .gte("observed_at", from)
      .order("observed_at", { ascending: true })
      .limit(5000);
    priceRows = (data ?? []) as typeof priceRows;
  }

  // --- observed transfers -------------------------------------------------
  const transfers = await getTransfersSince(from, { assetId: asset.id, limit: 5000 });
  const volumeInput = transfers.rows.map((r) => ({
    amount: fromBaseUnits(r.amount, asset.decimals),
    at: r.timestamp,
  }));

  const priceIntervals = supportedIntervals(priceRows.map((p) => p.observed_at));
  const activityIntervals = supportedIntervals(transfers.rows.map((r) => r.timestamp));

  const hasPrice = priceIntervals.length > 0;
  const available = hasPrice ? priceIntervals : activityIntervals;
  const interval =
    requestedInterval && available.includes(requestedInterval) ? requestedInterval : defaultInterval(available);

  const candles = hasPrice && interval ? aggregateCandles(priceRows.map((p) => ({ price: Number(p.price), observedAt: p.observed_at })), interval) : [];
  const volume = interval ? aggregateVolume(volumeInput, interval) : [];

  const priceSources = [...new Set(priceRows.map((p) => p.source))];

  return NextResponse.json({
    asset: {
      symbol: asset.symbol,
      name: asset.name,
      contract: asset.contract_address,
      type: asset.asset_type,
      decimals: asset.decimals,
    },
    series: hasPrice ? "price" : "activity",
    price_state: hasPrice ? "OK" : priceRows.length ? "PARTIAL" : "INDEXING",
    activity_state: transfers.state,
    range,
    interval,
    intervals: {
      all: INTERVALS,
      available,
    },
    candles,
    volume,
    observations: {
      price: priceRows.length,
      transfers: transfers.rows.length,
      capped: transfers.capped,
    },
    provenance: {
      price: priceSources.length ? priceSources : null,
      activity: "Robinhood Chain RPC — ERC-20 Transfer logs indexed by FOLDMARK",
    },
    updated_at: new Date().toISOString(),
    methodology:
      "OHLC is aggregated deterministically per bucket from stored price observations: open = first, high = max, low = min, close = last. Buckets without an observation produce no candle. Volume is the sum of observed transfer amounts in the bucket, in token units. When no price observation exists the price series is withheld and only observed activity is returned.",
  });
}
