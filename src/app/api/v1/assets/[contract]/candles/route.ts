import { NextResponse } from "next/server";
import { getAssetByAddress, getTransfersSince, since } from "@/lib/queries";
import { db } from "@/server/db/client";
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

  /**
   * Price series — one coherent market series, never a union of providers.
   *
   * GeckoTerminal and DEX Screener both quote these assets and they differ, so
   * pooling their rows into one candle would print a high from one provider and
   * a low from another as though a single venue had traded through both. That
   * candle would describe no market that exists.
   *
   * The default therefore reads canonical_prices, where reconciliation has
   * already chosen one observation per moment by a stated rule. Passing
   * ?source=<provider> instead returns that provider's own series, explicitly
   * labelled. There is no mode that mixes them.
   */
  const requestedSource = searchParams.get("source");
  const seriesKind = requestedSource ? "provider" : "canonical";

  let priceRows: { price: number; observed_at: string; source: string }[] = [];
  let seriesSource = "canonical";
  let seriesNote: string;

  const sql = db();

  if (sql) {
    if (seriesKind === "canonical") {
      priceRows = await priceSeries(
        () => sql`
          select price, observed_at, source
          from canonical_prices
          where asset_id = ${asset.id}
            and observed_at >= ${from}::timestamptz
          order by observed_at asc
          limit 5000
        `,
      );
      const sources = [...new Set(priceRows.map((r) => r.source))];
      seriesSource = sources.length === 1 ? sources[0] : "canonical";
      seriesNote =
        sources.length > 1
          ? `The canonical selection changed source during this range (${sources.join(", ")}). Each point is one real observation from the named source; the series is continuous in time, not in venue.`
          : "Every point is the observation reconciliation selected, from a single source across this range.";
    } else {
      priceRows = await priceSeries(
        () => sql`
          select price, observed_at, source
          from price_observations
          where asset_id = ${asset.id}
            and source = ${requestedSource}
            and observed_at >= ${from}::timestamptz
          order by observed_at asc
          limit 5000
        `,
      );
      seriesSource = requestedSource!;
      seriesNote = `Raw observations from ${requestedSource} only. No other source contributes to this series.`;
    }
  } else {
    seriesNote = "Storage is not configured for this deployment.";
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
    series_kind: hasPrice ? seriesKind : "observed_activity",
    series_source: hasPrice ? seriesSource : "foldmark_indexer",
    series_note: hasPrice
      ? seriesNote
      : "No price series exists for this asset yet, so observed transfer activity is returned instead. It is not price and is labelled as such.",
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
      "OHLC is aggregated deterministically per bucket from ONE coherent price series: open = first observation, high = maximum, low = minimum, close = last. The default series is canonical_prices, where reconciliation selected a single observation per moment; quotes from different providers are never pooled into the same candle, because that would invent a high and a low no venue printed. Pass ?source=<provider> for that provider's own raw series. Buckets without an observation produce no candle and nothing is carried forward. Volume is the sum of observed transfer amounts in the bucket, in token units — it is not trade volume.",
  });
}

/**
 * Run one price-series query and normalise what Postgres returns.
 *
 * Two conversions are not cosmetic. `price` is a numeric column and arrives as
 * a string, so arithmetic on it would concatenate rather than add. `observed_at`
 * is timestamptz and arrives as a Date, while every consumer downstream —
 * bucketing, interval detection, the JSON response — is written against an ISO
 * string. Both are converted once, here, rather than guessed at each use.
 *
 * A failed query degrades to an empty series rather than throwing: a chart with
 * no points reads INDEXING, which is true, whereas a 500 tells the reader
 * nothing about the data.
 */
async function priceSeries(
  run: () => Promise<Record<string, unknown>[]>,
): Promise<{ price: number; observed_at: string; source: string }[]> {
  try {
    const rows = await run();
    return rows.map((r) => ({
      price: Number(r.price),
      observed_at: r.observed_at instanceof Date ? r.observed_at.toISOString() : String(r.observed_at),
      source: String(r.source),
    }));
  } catch {
    return [];
  }
}
