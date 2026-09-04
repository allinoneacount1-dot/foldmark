"use client";

/**
 * Suggestion and follow-up chips.
 *
 * Same control grammar as the filter chips elsewhere in FOLDMARK, so a reader
 * who has used the product recognises them immediately. They wrap on desktop and
 * scroll horizontally on narrow screens rather than crushing their labels.
 */

export function IntelligenceSuggestions({
  label,
  items,
  onPick,
  disabled,
}: {
  label: string;
  items: { id: string; label: string }[];
  onPick: (id: string, label: string) => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="label-s mt-1.5 shrink-0 text-ink-faint">{label}</span>
      <div className="-mx-1 flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-x-auto px-1 pb-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(item.id, item.label)}
            className="shrink-0 border border-rule px-2 py-1 text-left font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-signal/50 hover:text-ink focus-visible:outline-none focus-visible:border-signal focus-visible:text-ink disabled:opacity-40"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
