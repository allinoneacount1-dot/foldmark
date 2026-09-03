"use client";

import { useEffect } from "react";
import { Shell } from "@/components/layout/Frame";
import { Display, Lede, StateTag } from "@/components/ui/primitives";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[foldmark]", error);
  }, [error]);

  return (
    <Shell>
      <div className="band-quiet">
        <StateTag state="UNAVAILABLE" label="RENDER FAILED" />
        <Display as="h1" size="l" className="mt-4 max-w-[22ch]">
          This view could not be assembled.
        </Display>
        <Lede className="mt-4">
          The page failed while reading from the index. This is a fault in FOLDMARK or in its data source — it is not a
          statement about the chain.
        </Lede>
        {error.digest ? <p className="label-s mt-4 text-ink-faint">DIGEST {error.digest}</p> : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex h-11 items-center border border-rule-strong px-5 font-mono text-label-s uppercase tracking-[0.16em] text-ink transition-colors duration-[180ms] hover:bg-ink hover:text-void"
        >
          RETRY
        </button>
      </div>
    </Shell>
  );
}
