"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "@/lib/format";
import { IconSearch } from "@/components/icons";

/**
 * A real form. Submitting a valid address navigates to its wallet page;
 * anything else is refused inline rather than silently doing nothing.
 */
export function AddressLookup({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const addr = value.trim();
        if (!isAddress(addr)) {
          setError("Enter a 0x address followed by 40 hexadecimal characters.");
          return;
        }
        setError(null);
        router.push(`/wallet/${addr.toLowerCase()}`);
      }}
      className="w-full max-w-[42rem]"
    >
      <label htmlFor="address-lookup" className="label-s">
        INSPECT ANY PUBLIC ADDRESS
      </label>
      <div className="mt-2 flex">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 border border-rule-strong bg-surface px-3">
          <IconSearch size={14} className="shrink-0 text-ink-faint" />
          <input
            id="address-lookup"
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "address-lookup-error" : undefined}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent font-mono text-data text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="-ml-px h-12 shrink-0 border border-rule-strong px-5 font-mono text-label-s uppercase tracking-[0.16em] text-ink transition-colors duration-[180ms] hover:bg-ink hover:text-void"
        >
          INSPECT
        </button>
      </div>
      {error ? (
        <p id="address-lookup-error" role="alert" className="mt-2 font-mono text-data-s text-negative">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-body-s text-ink-muted">
          No connection required. Wallet analysis is built from public transfer logs.
        </p>
      )}
    </form>
  );
}
