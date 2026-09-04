"use client";

import { useId, useState } from "react";

/**
 * The market topology, as a composition rather than a graph.
 *
 * FOLDMARK's measured canvas draws whatever the index observed, which before a
 * database is connected is nothing. This is the other thing a topology surface
 * can honestly be: a diagram of the SHAPE the product reads markets in —
 * sources on the left, assets through the middle, counterparties on the right.
 * That shape is real and fixed whether or not any particular transfer has been
 * seen, so drawing it claims nothing.
 *
 * WHAT KEEPS IT HONEST
 *
 * Every label is a CATEGORY: WALLET, WALLET CLUSTER, PROTOCOL, ASSET A, MARKET,
 * LIQUIDITY. No address, no symbol, no protocol name, no amount, no price, no
 * count. There is nothing here that could be mistaken for an observation,
 * because there is no observation-shaped thing in it — the diagram has no slot
 * for a number at all.
 *
 * It is built as one SVG with a viewBox rather than positioned HTML: the elbow
 * connectors have to meet the cards exactly, and geometry that scales as a unit
 * is the only way that survives every viewport without a measuring pass. The
 * mobile layout is a separate stacked composition, not this one shrunk, because
 * a three-column diagram at 375px is unreadable however faithfully it scales.
 */

type NodeKind = "wallet" | "cluster" | "protocol" | "asset" | "market" | "liquidity";

type Node = {
  id: string;
  label: string;
  kind: NodeKind;
  lane: "source" | "asset" | "counterparty";
};

const SOURCE: Node[] = [
  { id: "s1", label: "WALLET", kind: "wallet", lane: "source" },
  { id: "s2", label: "WALLET CLUSTER", kind: "cluster", lane: "source" },
  { id: "s3", label: "PROTOCOL", kind: "protocol", lane: "source" },
];

const ASSETS: Node[] = [
  { id: "a1", label: "ASSET A", kind: "asset", lane: "asset" },
  { id: "a2", label: "ASSET B", kind: "asset", lane: "asset" },
];

const COUNTERPARTY: Node[] = [
  { id: "c1", label: "WALLET", kind: "wallet", lane: "counterparty" },
  { id: "c2", label: "MARKET", kind: "market", lane: "counterparty" },
  { id: "c3", label: "LIQUIDITY", kind: "liquidity", lane: "counterparty" },
];

const ALL = [...SOURCE, ...ASSETS, ...COUNTERPARTY];

/** What each category means, for the hover readout. No metrics — definitions. */
const MEANING: Record<NodeKind, string> = {
  wallet: "An address that sent or received a transfer",
  cluster: "Addresses that move together across the same assets",
  protocol: "A contract identified as a named venue or protocol",
  asset: "A token contract observed moving between addresses",
  market: "A venue where the asset is quoted",
  liquidity: "Reserve backing a quote at a venue",
};

/* --------------------------------------------------------------- geometry */

const VB = { w: 1600, h: 760 };
const CARD = { w: 400, h: 108, ax: 410, ah: 168 };
const COL = { source: 80, asset: 600, counter: 1120 };
const ROW = { s: [250, 430, 610], a: [268, 500], c: [250, 430, 610] };

function sourceY(i: number) { return ROW.s[i]; }
function assetY(i: number) { return ROW.a[i]; }
function counterY(i: number) { return ROW.c[i]; }

/* ------------------------------------------------------------------ icons */

function Icon({ kind, x, y }: { kind: NodeKind; x: number; y: number }) {
  const s = "var(--fm-icon)";
  const common = { stroke: s, fill: "none", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="21" stroke={s} fill="none" strokeWidth="1" opacity="0.5" />
      {kind === "wallet" ? (
        <g {...common}>
          <path d="M-9 -6h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
          <path d="M-11 -4v-2a2 2 0 0 1 2-2h11" />
          <circle cx="4" cy="1.5" r="1.6" fill={s} stroke="none" />
        </g>
      ) : null}
      {kind === "cluster" ? (
        <g {...common}>
          <circle cx="-8" cy="-4" r="3" />
          <circle cx="7" cy="-7" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="-6" cy="7" r="2.4" />
          <path d="M-5.4 -4.8 4.2 -6.6M-5.6 -2.6 3.6 4.6M-4.2 6.2 3.6 6.6" />
        </g>
      ) : null}
      {kind === "protocol" ? (
        <g {...common}>
          <path d="M0 -10 8.6 -5v10L0 10-8.6 5v-10z" />
          <path d="M0 -10v20M-8.6 -5 0 0l8.6-5" opacity="0.55" />
        </g>
      ) : null}
      {kind === "asset" ? (
        <g {...common}>
          <path d="M0 -9 8 -4.5 0 0-8-4.5z" />
          <path d="M-8 0.5 0 5l8-4.5" />
          <path d="M-8 5.5 0 10l8-4.5" opacity="0.6" />
        </g>
      ) : null}
      {kind === "market" ? (
        <g {...common}>
          <path d="M-8 6v-7M-3 6v-12M2 6v-9M7 6v-4" strokeWidth="1.8" />
        </g>
      ) : null}
      {kind === "liquidity" ? (
        <g {...common}>
          <path d="M0 -10c5 6 7.5 9 7.5 12A7.5 7.5 0 0 1 0 9.5 7.5 7.5 0 0 1-7.5 2c0-3 2.5-6 7.5-12z" />
        </g>
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------- card */

function Card({
  node,
  x,
  y,
  w,
  h,
  emphasis,
  active,
  dimmed,
  onEnter,
  onLeave,
  patternId,
}: {
  node: Node;
  x: number;
  y: number;
  w: number;
  h: number;
  emphasis: boolean;
  active: boolean;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
  patternId: string;
}) {
  const cy = y + h / 2;
  return (
    <g
      className="fm-node"
      data-active={active || undefined}
      data-dimmed={dimmed || undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      tabIndex={0}
      role="img"
      aria-label={`${node.label}. ${MEANING[node.kind]}.`}
    >
      <rect x={x} y={y} width={w} height={h} className="fm-card" rx="2" />

      {/* Assets carry the accent rail and the texture: they are what the map is
          about, and the eye should land on the centre column first. */}
      {emphasis ? (
        <>
          <rect x={x} y={y} width="5" height={h} className="fm-rail" />
          <rect x={x + w * 0.52} y={y + 1} width={w * 0.48 - 1} height={h - 2} fill={`url(#${patternId})`} opacity="0.5" />
        </>
      ) : null}

      <Icon kind={node.kind} x={x + (emphasis ? 74 : 52)} y={cy} />

      <text
        x={x + (emphasis ? 118 : 84)}
        y={cy}
        className={emphasis ? "fm-label-lg" : "fm-label"}
        dominantBaseline="central"
      >
        {node.label}
      </text>

      {!emphasis ? (
        <text x={x + w - 24} y={y + h - 20} className="fm-ellipsis" textAnchor="end">
          &middot;&middot;&middot;
        </text>
      ) : null}
    </g>
  );
}

/* ----------------------------------------------------------------- module */

export function FoldmarkTopologyPreview({
  variant = "full",
  className = "",
}: {
  /** `full` fills a page; `compact` sits in a dashboard slot. */
  variant?: "full" | "compact";
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const grid = `fm-grid-${uid}`;
  const dots = `fm-dots-${uid}`;
  const glow = `fm-glow-${uid}`;

  const [hover, setHover] = useState<string | null>(null);
  const hovered = ALL.find((n) => n.id === hover) ?? null;

  /** A connector lights when either end is the node under the cursor. */
  const lit = (a: string, b: string) => hover === a || hover === b;
  const dim = (id: string) => hover !== null && hover !== id;

  const elbows: { from: string; to: string; d: string; dot: [number, number]; arrow: [number, number] }[] = [];

  // sources -> assets: out of the card, along a shared spine, into the asset
  SOURCE.forEach((s, i) => {
    const y = sourceY(i) + CARD.h / 2;
    const target = i === 2 ? 1 : 0;
    const ty = assetY(target) + CARD.ah / 2;
    const spine = COL.asset - 92;
    const x0 = COL.source + CARD.w;
    elbows.push({
      from: s.id,
      to: ASSETS[target].id,
      d: `M ${x0} ${y} H ${spine} V ${ty} H ${COL.asset - 26}`,
      dot: [x0, y],
      arrow: [COL.asset - 26, ty],
    });
  });

  // assets -> counterparties
  const fanout: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 2]];
  fanout.forEach(([ai, ci]) => {
    const y = assetY(ai) + CARD.ah / 2;
    const ty = counterY(ci) + CARD.h / 2;
    const spine = COL.counter - 92;
    const x0 = COL.asset + CARD.ax;
    elbows.push({
      from: ASSETS[ai].id,
      to: COUNTERPARTY[ci].id,
      d: `M ${x0} ${y} H ${spine} V ${ty} H ${COL.counter - 26}`,
      dot: [x0, y],
      arrow: [COL.counter - 26, ty],
    });
  });

  return (
    <section
      aria-label="FOLDMARK market topology"
      className={`fm-topo relative overflow-hidden border border-rule bg-void ${className}`}
    >
      {/* ------------------------------------------------------- desktop */}
      <div className="hidden sm:block">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          className="block w-full"
          style={{ height: variant === "compact" ? "clamp(19rem, 34vw, 26rem)" : "clamp(24rem, 46vw, 40rem)" }}
          role="presentation"
        >
          <defs>
            <pattern id={grid} width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M40 34v12M34 40h12" stroke="var(--fm-grid)" strokeWidth="1" fill="none" />
            </pattern>
            <pattern id={dots} width="7" height="7" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="var(--fm-dot)" />
            </pattern>
            <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={VB.w} height={VB.h} fill={`url(#${grid})`} />

          {/* lane headings */}
          {(
            [
              ["SOURCE", COL.source + CARD.w / 2],
              ["ASSET", COL.asset + CARD.ax / 2],
              ["COUNTERPARTY", COL.counter + CARD.w / 2],
            ] as const
          ).map(([label, cx]) => (
            <g key={label}>
              <text x={cx} y="150" className="fm-lane" textAnchor="middle">
                {label}
              </text>
              <path d={`M ${cx - 26} 172 H ${cx + 26}`} className="fm-lane-rule" />
            </g>
          ))}

          {/* connectors under the cards, so a card edge always wins */}
          <g className="fm-wires">
            {elbows.map((e, i) => (
              <g key={i} data-lit={lit(e.from, e.to) || undefined} className="fm-wire">
                <path d={e.d} />
                <circle cx={e.dot[0]} cy={e.dot[1]} r="4" className="fm-term" />
                <path
                  d={`M ${e.arrow[0] - 13} ${e.arrow[1] - 6} L ${e.arrow[0]} ${e.arrow[1]} L ${e.arrow[0] - 13} ${e.arrow[1] + 6}`}
                  className="fm-arrow"
                />
              </g>
            ))}
          </g>

          {SOURCE.map((n, i) => (
            <Card
              key={n.id}
              node={n}
              x={COL.source}
              y={sourceY(i)}
              w={CARD.w}
              h={CARD.h}
              emphasis={false}
              active={hover === n.id}
              dimmed={dim(n.id)}
              onEnter={() => setHover(n.id)}
              onLeave={() => setHover(null)}
              patternId={dots}
            />
          ))}

          {ASSETS.map((n, i) => (
            <Card
              key={n.id}
              node={n}
              x={COL.asset}
              y={assetY(i)}
              w={CARD.ax}
              h={CARD.ah}
              emphasis
              active={hover === n.id}
              dimmed={dim(n.id)}
              onEnter={() => setHover(n.id)}
              onLeave={() => setHover(null)}
              patternId={dots}
            />
          ))}

          {COUNTERPARTY.map((n, i) => (
            <Card
              key={n.id}
              node={n}
              x={COL.counter}
              y={counterY(i)}
              w={CARD.w}
              h={CARD.h}
              emphasis={false}
              active={hover === n.id}
              dimmed={dim(n.id)}
              onEnter={() => setHover(n.id)}
              onLeave={() => setHover(null)}
              patternId={dots}
            />
          ))}
        </svg>
      </div>

      {/* -------------------------------------------------------- mobile */}
      <div className="flex flex-col gap-0 sm:hidden">
        {(["source", "asset", "counterparty"] as const).map((lane) => (
          <div key={lane} className="border-b border-rule-faint last:border-b-0">
            <p className="label-s px-4 pb-1.5 pt-3 text-signal/70">{lane.toUpperCase()}</p>
            <div className="flex flex-col gap-px px-4 pb-3">
              {ALL.filter((n) => n.lane === lane).map((n) => (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 border px-3 py-2.5 ${
                    n.lane === "asset" ? "border-l-2 border-l-signal border-rule bg-raised" : "border-rule bg-surface"
                  }`}
                >
                  <svg viewBox="-24 -24 48 48" className="h-6 w-6 shrink-0" style={{ ["--fm-icon" as string]: "#A8ADA4" }}>
                    <Icon kind={n.kind} x={0} y={0} />
                  </svg>
                  <span className={n.lane === "asset" ? "label text-ink" : "label-s text-ink-muted"}>{n.label}</span>
                </div>
              ))}
            </div>
            {lane !== "counterparty" ? (
              <div aria-hidden className="flex justify-center pb-2">
                <span className="font-mono text-label-s text-ink-dim">&darr;</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* --------------------------------------------------------- readout */}
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-4 py-2.5">
        <span className="label-s text-ink-faint">
          {hovered ? (
            <>
              <span className="text-ink-muted">{hovered.label}</span> &middot; {MEANING[hovered.kind]}
            </>
          ) : (
            "OBSERVE · MAP · UNDERSTAND"
          )}
        </span>
        <span className="label-s shrink-0 text-ink-dim">ARCHITECTURE PREVIEW</span>
      </footer>
    </section>
  );
}
