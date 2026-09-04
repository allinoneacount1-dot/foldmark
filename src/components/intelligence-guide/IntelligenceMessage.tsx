"use client";

/**
 * One turn in the conversation.
 *
 * No bubbles and no tails. A question is a labelled line in the reader's own
 * voice; an answer is body copy under a rule, the way a document is set. The
 * only decoration is a thin mono label saying who is speaking, which is also
 * what makes the roles distinguishable without relying on colour.
 */

import Link from "next/link";
import type { Action, ConfidenceLevel, Followup } from "@/lib/intelligence/types";

export type Turn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "guide";
      text: string;
      contextLine?: string;
      actions?: Action[];
      level?: ConfidenceLevel;
      /** Which layer produced this, shown so the reader is never misled about it. */
      source?: "static" | "reasoning";
      streaming?: boolean;
      /** Carried so the panel can offer the entry's own follow-ups after it. */
      followups?: Followup[];
      intentId?: string;
    };

/** Paragraphs are separated by a blank line in the knowledge base. */
function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

export function IntelligenceMessage({ turn, onAction }: { turn: Turn; onAction?: () => void }) {
  if (turn.role === "user") {
    return (
      <div className="border-l-2 border-rule-strong pl-3">
        <p className="label-s text-ink-faint">YOU</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-body-s text-ink-muted">{turn.text}</p>
      </div>
    );
  }

  return (
    <div className="border-l-2 border-signal/40 pl-3">
      <p className="label-s flex items-center gap-2 text-ink-faint">
        FOLDMARK
        {turn.source === "reasoning" ? (
          /* Named explicitly. A reader must always be able to tell a written
             answer from a generated one. */
          <span className="text-ink-dim">· REASONING</span>
        ) : null}
        {turn.level === "MEDIUM" ? <span className="text-ink-dim">· UNCERTAIN</span> : null}
      </p>

      {turn.contextLine ? (
        <p className="mt-1.5 border border-rule bg-void px-2 py-1.5 font-mono text-label-s uppercase tracking-[0.12em] text-ink-dim">
          {turn.contextLine}
        </p>
      ) : null}

      <div className="mt-1.5 space-y-2.5">
        {paragraphs(turn.text).map((p, i) => (
          <p key={i} className="break-words text-body-s leading-relaxed text-ink">
            {p}
          </p>
        ))}
        {turn.streaming ? (
          <span
            aria-hidden="true"
            className="inline-block h-3 w-[7px] translate-y-[2px] bg-signal/80 motion-safe:animate-pulse"
          />
        ) : null}
      </div>

      {turn.actions?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {turn.actions.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              onClick={onAction}
              className="border border-rule px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-signal/50 hover:text-ink focus-visible:outline-none focus-visible:border-signal focus-visible:text-ink"
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
