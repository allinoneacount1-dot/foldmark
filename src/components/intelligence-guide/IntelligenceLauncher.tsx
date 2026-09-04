"use client";

/**
 * The launcher.
 *
 * A control on a terminal, not a chat bubble. It sits in the bottom-right
 * corner in the product's own mono label style, carries no avatar and no icon of
 * a robot, and states plainly what it opens. The only colour it spends is the
 * signal lime on focus and hover, which is the same rule every other control in
 * FOLDMARK follows.
 */

export function IntelligenceLauncher({
  onOpen,
  hidden,
}: {
  onOpen: () => void;
  /** Suppressed while the panel itself is open, so the two never overlap. */
  hidden: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label="Ask FOLDMARK — open the market structure guide"
      data-state={hidden ? "hidden" : "visible"}
      className={[
        "fixed bottom-4 right-4 z-40 group",
        "flex items-center gap-2 border border-rule-strong bg-elevated/95 backdrop-blur-sm",
        "px-3 py-2 font-mono text-label-s uppercase tracking-[0.16em] text-ink-muted",
        "transition-colors duration-150",
        "hover:border-signal/50 hover:text-ink",
        "focus-visible:outline-none focus-visible:border-signal focus-visible:text-ink",
        hidden ? "pointer-events-none opacity-0" : "opacity-100",
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      {/* A steady mark, not a pulse. Nothing here is a live indicator. */}
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-signal/70 transition-colors group-hover:bg-signal" />
      ASK FOLDMARK
      <span aria-hidden="true" className="text-ink-faint transition-colors group-hover:text-signal">
        ↗
      </span>
    </button>
  );
}
