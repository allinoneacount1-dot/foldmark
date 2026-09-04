"use client";

import { useEffect, useRef } from "react";
import { IntelligenceMessage, type Turn } from "@/components/intelligence-guide/IntelligenceMessage";
import { IntelligenceSuggestions } from "@/components/intelligence-guide/IntelligenceSuggestions";
import { IntelligenceComposer } from "@/components/intelligence-guide/IntelligenceComposer";

/**
 * The panel.
 *
 * A docked terminal column on desktop and a bottom sheet on narrow screens. It
 * is a modal dialog in the accessibility tree: focus is trapped while it is
 * open, Escape closes it, and new answers are announced politely rather than
 * interrupting whatever a screen reader is already saying.
 *
 * The header states what the system is and how it is answering. That status is
 * not decoration — it is the reader's only way to know whether a given answer
 * was written or generated, so it is never softened into something vaguer.
 */
export function IntelligencePanel({
  turns,
  greeting,
  suggestions,
  followups,
  draft,
  busy,
  statusLabel,
  onDraftChange,
  onSend,
  onPick,
  onClear,
  onMinimize,
  onClose,
}: {
  turns: Turn[];
  greeting: string;
  suggestions: { id: string; label: string }[];
  followups: { id: string; label: string }[];
  draft: string;
  busy: boolean;
  /** e.g. "PRODUCT KNOWLEDGE · DETERMINISTIC" or "… · REASONING AVAILABLE". */
  statusLabel: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  onPick: (id: string, label: string) => void;
  onClear: () => void;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view without yanking the page behind the panel.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  /**
   * Focus containment.
   *
   * Tab cycles inside the panel while it is open. Without this a keyboard reader
   * tabs straight out into the page underneath and loses the dialog, which is
   * the most common way a modal is broken in practice.
   */
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="FOLDMARK Intelligence — market structure guide"
      className={[
        "m-enter-rise fixed z-50 flex flex-col border border-rule-strong bg-void shadow-2xl",
        // narrow: a bottom sheet that leaves the page visible above it
        "inset-x-0 bottom-0 max-h-[86dvh] sm:inset-x-auto",
        // wide: a docked column
        "sm:bottom-4 sm:right-4 sm:h-[min(38rem,calc(100dvh-6rem))] sm:w-[26rem] sm:max-h-none",
        "motion-reduce:animate-none",
      ].join(" ")}
    >
      {/* header */}
      <header className="shrink-0 border-b border-rule bg-surface px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="label text-ink">FOLDMARK INTELLIGENCE</h2>
            <p className="label-s mt-0.5 text-ink-faint">MARKET STRUCTURE GUIDE</p>
          </div>
          <div className="flex shrink-0 items-center gap-px">
            <button
              type="button"
              onClick={onClear}
              className="px-1.5 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-signal"
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize the guide"
              className="px-1.5 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-signal"
            >
              MIN
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the guide"
              className="px-1.5 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-signal"
            >
              CLOSE
            </button>
          </div>
        </div>
        <p className="label-s mt-1.5 text-ink-dim">{statusLabel}</p>
      </header>

      {/* conversation */}
      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="border-l-2 border-rule pl-3">
          <p className="label-s text-ink-faint">FOLDMARK</p>
          <p className="mt-1 text-body-s leading-relaxed text-ink-muted">{greeting}</p>
        </div>

        <div aria-live="polite" aria-atomic="false" className="mt-4 space-y-4">
          {turns.map((turn) => (
            <IntelligenceMessage key={turn.id} turn={turn} onAction={onClose} />
          ))}
        </div>
      </div>

      {/* suggestions */}
      {(followups.length || suggestions.length) && !busy ? (
        <div className="shrink-0 border-t border-rule-faint px-3 py-2.5">
          <IntelligenceSuggestions
            label={followups.length ? "NEXT" : "ASK"}
            items={followups.length ? followups : suggestions}
            onPick={onPick}
            disabled={busy}
          />
        </div>
      ) : null}

      <IntelligenceComposer value={draft} onChange={onDraftChange} onSend={onSend} busy={busy} autoFocus />
    </div>
  );
}
