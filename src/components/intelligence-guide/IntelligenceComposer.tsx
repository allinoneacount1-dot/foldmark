"use client";

import { useEffect, useRef } from "react";

/**
 * The composer.
 *
 * A textarea that grows to a few lines and then scrolls, so a long question is
 * readable while typing without the panel resizing under the reader. Enter
 * sends, Shift+Enter is a newline — the convention every messaging surface uses,
 * and the one people try first.
 *
 * Matching runs on SEND only. Nothing is scored per keystroke.
 */
export function IntelligenceComposer({
  value,
  onChange,
  onSend,
  busy,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit, up to a ceiling, then scroll inside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 116)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="flex items-end gap-2 border-t border-rule bg-surface px-3 py-2.5">
      <label htmlFor="foldmark-intelligence-input" className="sr-only">
        Ask FOLDMARK about the product, its data or the page you are viewing
      </label>
      <textarea
        id="foldmark-intelligence-input"
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask about this page, a term, or the methodology"
        className="min-w-0 flex-1 resize-none bg-transparent py-1 font-mono text-body-s text-ink placeholder:text-ink-faint focus:outline-none"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={busy || !value.trim()}
        className="shrink-0 border border-rule-strong px-2.5 py-1.5 font-mono text-label-s uppercase tracking-[0.16em] text-ink-muted transition-colors hover:border-signal/50 hover:text-ink focus-visible:outline-none focus-visible:border-signal focus-visible:text-ink disabled:cursor-not-allowed disabled:opacity-35"
      >
        {busy ? "…" : "SEND"}
      </button>
    </div>
  );
}
