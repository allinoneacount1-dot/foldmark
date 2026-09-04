"use client";

import { useId, useState } from "react";

/**
 * How a contract becomes a classified entity.
 *
 * Four stages, and the distance between them is the whole point. Observed is
 * not identified; identified is not categorized; categorized is not verified.
 * Collapsing any pair is how a product ends up asserting that thirteen tokens
 * were verified because their own metadata said so.
 *
 * WHY THE LAST STAGE IS USUALLY DARK
 *
 * VERIFIED means an authoritative source confirmed this exact contract on this
 * exact chain. A ticker is not evidence, a name is not evidence, and a
 * third-party market label is not evidence — anyone can deploy an ERC-20 called
 * "NVIDIA • Robinhood Token". FOLDMARK has no such source wired today, so the
 * honest state for every asset is CATEGORIZED at best, and this component
 * renders that: the fourth card stays unreached.
 *
 * The reference design shows VERIFIED lit. That is what the component looks
 * like when something genuinely reaches it, and `reached` is the prop that
 * decides. Lighting it by default would make the diagram a claim rather than a
 * description, which is the exact failure the pipeline exists to prevent.
 *
 * Two modes:
 *   mode="model"   the classification model itself, no entity in view. Nothing
 *                  is "current" because nothing is being classified.
 *   mode="entity"  one entity's actual position, driven by `reached`.
 */

export type PipelineStage = "OBSERVED" | "IDENTIFIED" | "CATEGORIZED" | "VERIFIED";

const STAGES: { id: PipelineStage; n: string; mechanism: string; evidence: string }[] = [
  {
    id: "OBSERVED",
    n: "01",
    mechanism: "A Transfer log named this contract",
    evidence: "An ERC-20 Transfer event on chain",
  },
  {
    id: "IDENTIFIED",
    n: "02",
    mechanism: "The contract answered ERC-20 metadata",
    evidence: "symbol, name and decimals read from the contract itself",
  },
  {
    id: "CATEGORIZED",
    n: "03",
    mechanism: "Its shape places it in a category",
    evidence: "On-chain behaviour and metadata. A category is not an identity",
  },
  {
    id: "VERIFIED",
    n: "04",
    mechanism: "An authoritative source confirms the exact contract",
    evidence: "Issuer-published address for this chain. A ticker or name is not enough",
  },
];

const ORDER: Record<PipelineStage, number> = {
  OBSERVED: 1,
  IDENTIFIED: 2,
  CATEGORIZED: 3,
  VERIFIED: 4,
};

export function ClassificationPipeline({
  mode = "model",
  reached,
  caption,
  className = "",
}: {
  /** `model` explains the pipeline; `entity` shows where one thing actually is. */
  mode?: "model" | "entity";
  /** The furthest stage genuinely reached. Omit in model mode. */
  reached?: PipelineStage | null;
  caption?: string;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const dots = `cp-dots-${uid}`;
  const [open, setOpen] = useState<PipelineStage | null>(null);

  const reachedAt = mode === "entity" && reached ? ORDER[reached] : 0;
  const detail = STAGES.find((s) => s.id === open) ?? null;

  const stateOf = (s: PipelineStage): "done" | "current" | "future" | "neutral" => {
    if (mode === "model") return "neutral";
    const i = ORDER[s];
    if (i < reachedAt) return "done";
    if (i === reachedAt) return "current";
    return "future";
  };

  return (
    <section
      aria-label={mode === "model" ? "Classification model" : "Classification state"}
      className={`cp relative border border-rule bg-void ${className}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="h-3 w-0.5 shrink-0 bg-signal" />
          <h3 className="label truncate text-ink">FROM TRANSFER LOGS</h3>
        </div>
        <span className="label-s shrink-0 text-ink-dim">
          {mode === "model" ? "CLASSIFICATION MODEL" : "CLASSIFICATION STATE"}
        </span>
      </header>

      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <pattern id={dots} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.75" fill="rgba(199,255,74,0.13)" />
          </pattern>
        </defs>
      </svg>

      {/*
        Horizontal on desktop, vertical on mobile — a rebuild rather than a
        scale, because four wide cards squeezed into 375px stop reading as a
        sequence at all.
      */}
      <div className="flex flex-col gap-0 p-4 md:flex-row md:items-stretch md:gap-0">
        {STAGES.map((s, i) => {
          const st = stateOf(s.id);
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center">
              <button
                type="button"
                onMouseEnter={() => setOpen(s.id)}
                onMouseLeave={() => setOpen(null)}
                onFocus={() => setOpen(s.id)}
                onBlur={() => setOpen(null)}
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                data-state={st}
                className="cp-card group relative flex min-h-[7.5rem] w-full min-w-0 flex-col justify-center px-5 py-6 text-left md:min-h-[9.5rem]"
              >
                {/* calibration corners */}
                <span aria-hidden className="cp-corner cp-tl" />
                <span aria-hidden className="cp-corner cp-tr" />
                <span aria-hidden className="cp-corner cp-bl" />
                <span aria-hidden className="cp-corner cp-br" />

                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-px opacity-70"
                  style={{ backgroundImage: `url(#${dots})` }}
                />

                <span className="cp-n font-mono text-label-s tracking-[0.2em]">{s.n}</span>
                <span aria-hidden className="cp-n-rule mt-1 block h-px w-4" />

                <span className="cp-name mt-3 block truncate font-mono text-[1.05rem] uppercase tracking-[0.16em] sm:text-[1.25rem]">
                  {s.id}
                </span>

                <span aria-hidden className="cp-plus absolute bottom-3 right-4 font-mono text-label-s">
                  +
                </span>
              </button>

              {i < STAGES.length - 1 ? (
                <div aria-hidden className="cp-link flex shrink-0 items-center justify-center py-2 md:px-2 md:py-0">
                  <svg viewBox="0 0 44 12" className="h-3 w-6 rotate-90 md:h-3 md:w-11 md:rotate-0">
                    <circle cx="3" cy="6" r="2.4" className="cp-term" />
                    <path d="M6 6 H33" className="cp-line" />
                    <path d="M31 2.5 L36 6 L31 9.5" className="cp-head" />
                  </svg>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-t border-rule px-4 py-2.5">
        <p className="label-s max-w-[62ch] normal-case tracking-[0.02em] text-ink-faint">
          {detail ? (
            <>
              <span className="uppercase tracking-[0.16em] text-ink-muted">{detail.id}</span> &middot;{" "}
              {detail.mechanism}. <span className="text-ink-dim">Evidence: {detail.evidence}.</span>
            </>
          ) : (
            (caption ??
              "A category is what a contract looks like. Verification is who it is — and needs an authoritative source for this exact address.")
          )}
        </p>
        <span className="label-s shrink-0 text-ink-dim">LISTED · FLOWS CLASSIFIABLE</span>
      </footer>
    </section>
  );
}
