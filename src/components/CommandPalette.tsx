"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/app/api/v1/search/route";
import { IconSearch, IconClose, IconStockToken, IconWallet, IconProtocol, IconBlock } from "@/components/icons";
import { shortAddress } from "@/lib/format";

const GROUP_ORDER = ["assets", "wallets", "protocols", "contracts"] as const;
const GROUP_LABEL = {
  assets: "ASSETS",
  wallets: "WALLETS",
  protocols: "PROTOCOLS",
  contracts: "CONTRACTS",
} as const;
const GROUP_ICON = {
  assets: IconStockToken,
  wallets: IconWallet,
  protocols: IconProtocol,
  contracts: IconBlock,
} as const;

/** The last settled response, tagged with the query that produced it. */
type Result = { query: string; ok: boolean; hits: SearchHit[] };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  const trimmed = query.trim();

  // Status is derived, never stored: a result that does not match the current
  // query simply means we are still waiting for one that does.
  const status: "idle" | "loading" | "done" | "error" = !trimmed
    ? "idle"
    : result?.query !== trimmed
      ? "loading"
      : result.ok
        ? "done"
        : "error";

  const hits = status === "done" && result ? result.hits : [];

  // debounce the query, and abandon in-flight responses that arrive out of order
  useEffect(() => {
    if (!open || !trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: { hits: SearchHit[] }) => {
          setResult({ query: trimmed, ok: true, hits: json.hits ?? [] });
          setCursor(0);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          setResult({ query: trimmed, ok: false, hits: [] });
        });
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, open]);

  // focus management: capture, move in, restore on close
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      router.push(hit.href);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c + 1) % hits.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c - 1 + hits.length) % hits.length : 0));
      return;
    }
    if (e.key === "Enter" && hits[cursor]) {
      e.preventDefault();
      go(hits[cursor]);
      return;
    }
    if (e.key === "Tab") {
      // single-stop dialog: keep focus on the input
      e.preventDefault();
    }
  };

  if (!open) return null;

  const orderedIndex = new Map(hits.map((hit, i) => [hit.group + ":" + hit.id, i]));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-void/80 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search FOLDMARK"
        className="w-full max-w-[640px] border border-rule-strong bg-surface"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <IconSearch size={15} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, name, contract or address"
            role="combobox"
            aria-label="Search assets, wallets, protocols and contracts"
            aria-controls={listId}
            aria-expanded={hits.length > 0}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className="h-14 flex-1 bg-transparent font-mono text-data text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 p-2 text-ink-faint transition-colors duration-[180ms] hover:text-ink"
          >
            <IconClose size={14} />
          </button>
        </div>

        <div id={listId} role="listbox" aria-label="Search results" className="max-h-[52vh] overflow-y-auto">
          {status === "idle" ? (
            <p className="px-4 py-6 font-mono text-label uppercase tracking-[0.16em] text-ink-faint">
              Search indexed assets, observed wallets, protocols and contracts
            </p>
          ) : null}

          {status === "loading" ? (
            <p className="px-4 py-6 font-mono text-label uppercase tracking-[0.16em] text-ink-faint">Searching…</p>
          ) : null}

          {status === "error" ? (
            <p className="px-4 py-6 font-mono text-label uppercase tracking-[0.16em] text-negative">
              Search unavailable — index not reachable
            </p>
          ) : null}

          {status === "done" && !hits.length ? (
            <p className="px-4 py-6 font-mono text-label uppercase tracking-[0.16em] text-ink-faint">
              No match in indexed data
            </p>
          ) : null}

          {GROUP_ORDER.map((group) => {
            const rows = hits.filter((h) => h.group === group);
            if (!rows.length) return null;
            const Icon = GROUP_ICON[group];
            return (
              <div key={group} className="border-b border-rule-faint last:border-b-0">
                <p className="label-s bg-void px-4 py-2">{GROUP_LABEL[group]}</p>
                {rows.map((hit) => {
                  const index = orderedIndex.get(hit.group + ":" + hit.id) ?? 0;
                  const active = index === cursor;
                  return (
                    <button
                      key={`${hit.group}:${hit.id}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => go(hit)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[180ms] ${
                        active ? "bg-raised" : "hover:bg-raised/60"
                      }`}
                    >
                      <Icon size={14} className="shrink-0 text-ink-faint" />
                      <span className="truncate font-mono text-data text-ink">
                        {hit.title.startsWith("0x") ? shortAddress(hit.title, 10, 8) : hit.title}
                      </span>
                      <span className="ml-auto truncate font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
                        {hit.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="flex items-center gap-4 border-t border-rule px-4 py-2 font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">
          <span>↑↓ NAVIGATE</span>
          <span>↵ OPEN</span>
          <span>ESC CLOSE</span>
        </p>
      </div>
    </div>
  );
}

/** Owns the ⌘K / Ctrl-K binding for the whole app. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
