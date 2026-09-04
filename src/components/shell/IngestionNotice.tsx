import Link from "next/link";
import { ingestionPaused } from "@/server/ingest/pause";

/**
 * A strip that says the index is not advancing.
 *
 * WHY IT IS GLOBAL. Pausing ingestion changes what every figure on every page
 * means. The numbers are still real observations — nothing is estimated and
 * nothing was deleted — but they describe a window that stopped moving, and a
 * reader who does not know that will read "27 transfers in 24H" as a chain that
 * went quiet rather than an index that stopped watching. That misreading is the
 * exact failure this product exists to prevent, so the correction belongs
 * everywhere the figures are, not on a status page a reader has to go and find.
 *
 * WHY IT IS QUIET. It is a standing condition, not an incident. A red banner
 * would say something broke; nothing broke. It states the fact once, in the
 * product's own voice, and gets out of the way.
 *
 * It renders nothing at all when ingestion is running, so the ordinary case
 * carries no chrome.
 */
export function IngestionNotice() {
  if (!ingestionPaused()) return null;

  return (
    <div className="border-b border-rule bg-void">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 md:px-6">
        <span className="label-s text-signal">INDEX PAUSED</span>
        <p className="label-s min-w-0 normal-case tracking-[0.02em] text-ink-faint">
          Ingestion is stopped by decision, not by failure. Every figure below is a real observation of what was already
          indexed; the window it covers has stopped moving. The chain head is read live and is unaffected.
        </p>
        <Link href="/docs/status" className="label-s text-ink-muted underline-offset-4 m-fast hover:text-ink hover:underline">
          WHAT THE INDEX HOLDS →
        </Link>
      </div>
    </div>
  );
}
