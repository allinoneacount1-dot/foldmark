"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconClose } from "@/components/icons";
import type { AssetType, FlowWindow } from "@/config/site";

/**
 * Registry search. Filtering is URL state so a filtered view is shareable and
 * survives reload; typing debounces into a replace() so the ledger updates
 * without a full navigation entry per keystroke.
 */
export function AssetSearch({
  initial,
  type,
  sort,
  window: flowWindow,
}: {
  initial: string;
  type: AssetType | null;
  sort: string;
  window: FlowWindow;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const sp = new URLSearchParams();
      if (value.trim()) sp.set("q", value.trim());
      if (type) sp.set("type", type);
      sp.set("sort", sort);
      sp.set("w", flowWindow);
      startTransition(() => router.replace(`/assets?${sp.toString()}`, { scroll: false }));
    }, 220);
    return () => clearTimeout(timer);
  }, [value, type, sort, flowWindow, router]);

  return (
    <div className="flex w-full max-w-[36rem] items-center gap-2.5 border border-rule bg-surface px-3">
      <IconSearch size={14} className="shrink-0 text-ink-faint" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Filter by symbol, name or contract"
        aria-label="Filter the asset registry"
        autoComplete="off"
        spellCheck={false}
        className="h-11 min-w-0 flex-1 bg-transparent font-mono text-data text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {pending ? <span className="label-s shrink-0 text-ink-faint">…</span> : null}
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear filter"
          className="shrink-0 p-1 text-ink-faint transition-colors duration-[180ms] hover:text-ink"
        >
          <IconClose size={13} />
        </button>
      ) : null}
    </div>
  );
}
