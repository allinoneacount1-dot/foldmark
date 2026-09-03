import type { ReactNode } from "react";

/**
 * A numbered figure with a caption and its provenance.
 *
 * Every chart and graph in FOLDMARK is wrapped in one. It is the convention
 * that makes the product read as research rather than marketing: the reader
 * always knows what they are looking at, over what window, and from what
 * source — without hovering anything.
 */
export function Figure({
  index,
  caption,
  provenance,
  children,
  aside,
  className = "",
}: {
  index: string;
  caption: ReactNode;
  provenance: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`flex min-h-0 flex-col border border-rule ${className}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="label-s shrink-0 text-ink-faint">FIG. {index}</span>
          <span className="min-w-0 text-body-s text-ink-muted">{caption}</span>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </figcaption>
      <div className="min-h-0 flex-1">{children}</div>
      <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">SOURCE {provenance}</p>
    </figure>
  );
}
