"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import type { Candle, Interval, VolumeBar } from "@/lib/ohlc";
import { INTERVALS } from "@/lib/ohlc";
import { WINDOWS, type FlowWindow } from "@/config/site";
import { compact, integer } from "@/lib/format";
import { StateTag } from "@/components/ui/primitives";
import { IconExpand, IconCollapse, IconSource } from "@/components/icons";
import type { DataState } from "@/lib/data-state";

/**
 * The market chart.
 *
 * Two honest modes:
 *   price    — candlestick / line / area from real OHLC observations
 *   activity — observed transfer volume and count, labelled as such
 *
 * It never invents a candle. When the price pipeline has no observation the
 * component says so and charts the activity FOLDMARK really does observe.
 */

type ChartPayload = {
  asset: { symbol: string; name: string; contract: string; type: string; decimals: number };
  series: "price" | "activity";
  price_state: DataState;
  activity_state: DataState;
  range: FlowWindow;
  interval: Interval | null;
  intervals: { all: readonly Interval[]; available: Interval[] };
  candles: Candle[];
  volume: VolumeBar[];
  observations: { price: number; transfers: number; capped: boolean };
  provenance: { price: string[] | null; activity: string };
  updated_at: string;
  methodology: string;
};

type ChartStyle = "candle" | "line" | "area";

const THEME = {
  background: "#080A08",
  text: "#7E857C",
  grid: "rgba(242,240,232,0.045)",
  border: "rgba(242,240,232,0.10)",
  crosshair: "rgba(242,240,232,0.28)",
  up: "#C7FF4A",
  down: "#E8785D",
  neutral: "#A8ADA4",
  volume: "rgba(168,173,164,0.28)",
  volumeHot: "rgba(199,255,74,0.5)",
};

export function MarketChart({
  contract,
  symbol,
  className = "",
  height = 380,
}: {
  contract: string;
  symbol: string;
  className?: string;
  height?: number;
}) {
  const [range, setRange] = useState<FlowWindow>("7D");
  const [interval, setInterval] = useState<Interval | null>(null);
  const [style, setStyle] = useState<ChartStyle>("candle");
  const [showVolume, setShowVolume] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  /** The last settled response, tagged with the request that produced it. */
  const [loaded, setLoaded] = useState<{ key: string; payload: ChartPayload | null } | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const requestKey = `${contract}|${range}|${interval ?? "auto"}`;

  // Status is derived rather than stored, so no render is triggered from
  // inside an effect just to say "loading".
  const status: "loading" | "ready" | "error" =
    loaded?.key !== requestKey ? "loading" : loaded.payload ? "ready" : "error";
  const payload = status === "ready" ? loaded!.payload : null;

  // ---- data --------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ range });
    if (interval) qs.set("interval", interval);
    const key = `${contract}|${range}|${interval ?? "auto"}`;

    fetch(`/api/v1/assets/${contract}/candles?${qs}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: ChartPayload) => {
        setLoaded({ key, payload: json });
        if (!interval && json.interval) setInterval(json.interval);
        if (json.series === "activity") setStyle((cur) => (cur === "candle" ? "line" : cur));
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setLoaded({ key, payload: null });
      });
    return () => controller.abort();
  }, [contract, range, interval]);

  const hasPriceSeries = payload?.series === "price" && payload.candles.length > 0;
  const hasActivitySeries = (payload?.volume.length ?? 0) > 0;
  const renderable = hasPriceSeries || hasActivitySeries;

  /** Buckets whose volume sits in the top decile — genuine large-activity events. */
  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    const volume = payload?.volume;
    if (!volume?.length) return [];
    const sorted = volume.map((v) => v.value).sort((a, b) => a - b);
    // top ventile only, so labels never collide into an unreadable smear
    const threshold = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
    return volume
      .filter((v) => v.value >= threshold && v.value > 0)
      .slice(-5)
      .map((v) => ({
        time: v.time as UTCTimestamp,
        position: "aboveBar" as const,
        color: THEME.up,
        shape: "circle" as const,
        text: `${compact(v.value)} · ${v.transfers} TX`,
      }));
  }, [payload]);

  // ---- chart lifecycle ---------------------------------------------------
  useEffect(() => {
    if (!renderable) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    // the library is only pulled in once there is something real to draw
    import("lightweight-charts").then((lib) => {
      if (disposed || !hostRef.current) return;
      const chart = lib.createChart(hostRef.current, {
        autoSize: true,
        layout: {
          background: { color: THEME.background },
          textColor: THEME.text,
          fontFamily: 'ui-monospace, "Geist Mono", monospace',
          fontSize: 10,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: THEME.grid },
          horzLines: { color: THEME.grid },
        },
        rightPriceScale: { borderColor: THEME.border, scaleMargins: { top: 0.12, bottom: showVolume ? 0.28 : 0.08 } },
        timeScale: { borderColor: THEME.border, timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: lib.CrosshairMode.Normal,
          vertLine: { color: THEME.crosshair, width: 1, style: lib.LineStyle.Dotted, labelBackgroundColor: "#151914" },
          horzLine: { color: THEME.crosshair, width: 1, style: lib.LineStyle.Dotted, labelBackgroundColor: "#151914" },
        },
        handleScale: { axisPressedMouseMove: { time: true, price: false } },
      });
      chartRef.current = chart;

      if (hasPriceSeries && payload) {
        if (style === "candle") {
          const s = chart.addSeries(lib.CandlestickSeries, {
            upColor: THEME.up,
            downColor: THEME.down,
            borderUpColor: THEME.up,
            borderDownColor: THEME.down,
            wickUpColor: THEME.up,
            wickDownColor: THEME.down,
          });
          s.setData(payload.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
          priceSeriesRef.current = s;
        } else if (style === "line") {
          const s = chart.addSeries(lib.LineSeries, { color: THEME.up, lineWidth: 1 });
          s.setData(payload.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
          priceSeriesRef.current = s;
        } else {
          const s = chart.addSeries(lib.AreaSeries, {
            lineColor: THEME.up,
            topColor: "rgba(199,255,74,0.14)",
            bottomColor: "rgba(199,255,74,0)",
            lineWidth: 1,
          });
          s.setData(payload.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
          priceSeriesRef.current = s;
        }
      } else if (payload) {
        // activity mode: transfer count as the primary line, never styled as price
        const s = chart.addSeries(lib.LineSeries, { color: THEME.neutral, lineWidth: 1, priceLineVisible: false });
        s.setData(payload.volume.map((v) => ({ time: v.time as UTCTimestamp, value: v.transfers })));
        priceSeriesRef.current = s;
      }

      if (showVolume && payload?.volume.length) {
        const max = Math.max(...payload.volume.map((v) => v.value));
        const vol = chart.addSeries(lib.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: THEME.volume,
        });
        vol.setData(
          payload.volume.map((v) => ({
            time: v.time as UTCTimestamp,
            value: v.value,
            color: v.value >= max * 0.75 ? THEME.volumeHot : THEME.volume,
          })),
        );
        chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        volumeSeriesRef.current = vol;
      }

      if (markers.length && priceSeriesRef.current) {
        lib.createSeriesMarkers(priceSeriesRef.current, markers);
      }

      chart.timeScale().fitContent();

      cleanup = () => {
        chart.remove();
        chartRef.current = null;
        priceSeriesRef.current = null;
        volumeSeriesRef.current = null;
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [payload, style, showVolume, renderable, hasPriceSeries, markers]);

  // ---- fullscreen --------------------------------------------------------
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  const reset = useCallback(() => chartRef.current?.timeScale().fitContent(), []);

  const available = payload?.intervals.available ?? [];

  const body = (
    <div
      className={`flex flex-col border border-rule bg-void ${fullscreen ? "min-h-0 flex-1" : ""} ${className}`}
    >
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="label-s text-ink">{symbol}</span>
          {payload ? (
            <StateTag
              state={payload.series === "price" ? payload.price_state : payload.activity_state}
              label={payload.series === "price" ? undefined : "OBSERVED ACTIVITY"}
            />
          ) : null}
        </div>

        {hasPriceSeries ? (
          <div role="group" aria-label="Chart style" className="flex">
            {(["candle", "line", "area"] as ChartStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                aria-pressed={style === s}
                className={`h-7 border px-2 font-mono text-label-s uppercase tracking-[0.14em] m-fast ${
                  style === s ? "border-ink bg-ink text-void" : "border-rule text-ink-dim hover:text-ink"
                } -ml-px first:ml-0`}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div role="group" aria-label="Interval" className="flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {INTERVALS.map((i) => {
            const enabled = available.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!enabled}
                onClick={() => setInterval(i)}
                aria-pressed={interval === i}
                title={enabled ? `${i} candles` : `${i} not supported by available observations`}
                className={`h-7 shrink-0 border px-2 font-mono text-label-s uppercase tracking-[0.14em] m-fast -ml-px first:ml-0 ${
                  interval === i
                    ? "border-ink bg-ink text-void"
                    : enabled
                      ? "border-rule text-ink-dim hover:text-ink"
                      : "cursor-not-allowed border-rule text-ink-faint/40"
                }`}
              >
                {i}
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Range" className="flex">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setRange(w);
                setInterval(null);
              }}
              aria-pressed={range === w}
              className={`h-7 border px-2 font-mono text-label-s uppercase tracking-[0.14em] m-fast -ml-px first:ml-0 ${
                range === w ? "border-signal text-signal" : "border-rule text-ink-dim hover:text-ink"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowVolume((v) => !v)}
            aria-pressed={showVolume}
            className={`h-7 border px-2 font-mono text-label-s uppercase tracking-[0.14em] m-fast ${
              showVolume ? "border-rule-strong text-ink" : "border-rule text-ink-dim hover:text-ink"
            }`}
          >
            VOL
          </button>
          <button
            type="button"
            onClick={reset}
            className="h-7 border border-rule px-2 font-mono text-label-s uppercase tracking-[0.14em] text-ink-dim m-fast hover:text-ink"
          >
            RESET
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen chart"}
            className="grid h-7 w-7 place-items-center border border-rule text-ink-dim m-fast hover:text-ink"
          >
            {fullscreen ? <IconCollapse size={13} /> : <IconExpand size={13} />}
          </button>
        </div>
      </div>

      {/* surface */}
      <div
        className={fullscreen ? "relative min-h-0 flex-1" : "relative w-full shrink-0"}
        style={fullscreen ? undefined : { height }}
      >
        {status === "loading" ? (
          <p className="absolute inset-0 grid place-items-center font-mono text-label uppercase tracking-[0.16em] text-ink-faint">
            LOADING PRICE HISTORY…
          </p>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 grid place-items-center gap-3 p-6 text-center">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-negative">CHART DATA UNAVAILABLE</p>
            <button
              type="button"
              onClick={() => setRange((r) => r)}
              className="h-8 border border-rule-strong px-3 font-mono text-label-s uppercase tracking-[0.16em] text-ink hover:bg-ink hover:text-void"
            >
              RETRY
            </button>
          </div>
        ) : null}

        {status === "ready" && !renderable ? (
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-2 p-6">
            <StateTag state={payload?.price_state ?? "INDEXING"} />
            <p className="font-display text-[1.25rem] text-ink">Insufficient history to chart</p>
            <p className="max-w-[46ch] text-body-s text-ink-muted">
              {integer(payload?.observations.price ?? 0)} price observations and{" "}
              {integer(payload?.observations.transfers ?? 0)} transfers indexed for this asset in the {range} window. A
              series is drawn once at least four intervals contain an observation.
            </p>
          </div>
        ) : null}

        <div ref={hostRef} className="h-full w-full" aria-hidden={!renderable} />
      </div>

      {/* provenance */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule px-3 py-2">
        <p className="flex items-center gap-1.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
          <IconSource size={10} />
          {payload?.series === "price"
            ? `PRICE — ${payload.provenance.price?.join(", ") ?? "UNKNOWN SOURCE"}`
            : "ACTIVITY — ROBINHOOD CHAIN RPC · TRANSFER LOGS"}
        </p>
        {payload ? (
          <p className="font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
            INTERVAL {interval ?? "—"} · {integer(payload.observations.transfers)} TX OBSERVED
          </p>
        ) : null}
        {payload ? (
          <p className="ml-auto font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
            UPDATED <time dateTime={payload.updated_at}>{payload.updated_at.slice(11, 19)} UTC</time>
          </p>
        ) : null}
      </div>
    </div>
  );

  if (!fullscreen) return body;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-void p-3" role="dialog" aria-modal="true" aria-label={`${symbol} chart, fullscreen`}>
      {body}
    </div>
  );
}
