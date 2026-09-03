import type { DataState } from "@/lib/data-state";

/**
 * How a data state is said to a person.
 *
 * `DataState` is the machine's vocabulary and it does not change: the API keeps
 * returning UNAVAILABLE, the docs keep documenting it, and every internal
 * decision keeps reading it. Corrupting that to make a screen look better would
 * trade the one thing this product is for.
 *
 * But UNAVAILABLE is a statement about our infrastructure, not about the market,
 * and a person reading an asset page did not ask about our infrastructure. The
 * same fact — "we have not observed this yet" — is better said as SYNCING on a
 * price panel and STRUCTURE INITIALIZING on a topology canvas. That is not
 * softening the truth; it is saying the same truth in the reader's terms.
 *
 * The line this module does not cross: presentation may change the WORDS around
 * a missing value. It may never supply the value. A dash stays a dash, a chart
 * with no observations stays empty, and nothing here can put a number on screen.
 *
 *   allowed      "SYNCING MARKET DATA" instead of "DATA UNAVAILABLE"
 *   allowed      an em dash where a price would go
 *   forbidden    a price, a range, a candle, a holder count, an address
 */

/** What kind of thing is missing. Decides which sentence is the honest one. */
export type Surface =
  | "price"
  | "liquidity"
  | "market"
  | "flow"
  | "activity"
  | "topology"
  | "registry"
  | "wallet"
  | "protocol"
  | "network"
  | "chart"
  | "generic";

export type PresentationTone =
  /** Something is expected to arrive. */
  | "pending"
  /** Real data, but less of it than the label implies. */
  | "partial"
  /** Nothing there, and that is a finding rather than a fault. */
  | "quiet"
  /** Measured and current. */
  | "live";

export type Presentation = {
  /** Terminal micro-label, for a chip or a metric caption. Two or three words. */
  label: string;
  /** A short line for an empty region. Sentence case, no full stop. */
  headline: string;
  /** One sentence of context. Says what is happening, not what is broken. */
  detail: string;
  tone: PresentationTone;
};

/**
 * The pending copy per surface.
 *
 * UNAVAILABLE and INDEXING both mean "not observed yet" to a reader — the
 * difference between "our storage is not connected" and "the pipeline has not
 * reached this" is an operational distinction, and it stays in the API where
 * operators read it.
 */
const PENDING: Record<Surface, Omit<Presentation, "tone">> = {
  price: {
    label: "SYNCING",
    headline: "Awaiting the first price observation",
    detail: "No venue has been observed quoting this asset yet. A price appears here the moment one is.",
  },
  liquidity: {
    label: "AWAITING VENUE DATA",
    headline: "Awaiting verified venue data",
    detail: "Depth is read from the pool that produced the quote. It appears once a venue has been identified.",
  },
  market: {
    label: "SYNCING MARKET DATA",
    headline: "Connecting to the market layer",
    detail: "Market state is built from observed venue quotes. Figures appear as observations arrive.",
  },
  flow: {
    label: "AWAITING OBSERVATIONS",
    headline: "Awaiting observed transfers",
    detail: "Flow is folded from transfers as they are indexed. Nothing is shown until something moves.",
  },
  activity: {
    label: "INDEXING",
    headline: "Indexing chain activity",
    detail: "Activity is counted from token transfer logs as the indexer reaches them.",
  },
  topology: {
    label: "STRUCTURE INITIALIZING",
    headline: "Structure layer initializing",
    detail: "The map draws itself from observed relationships. It stays empty until value moves between addresses.",
  },
  registry: {
    label: "INDEXING REGISTRY",
    headline: "Indexing the asset registry",
    detail: "An asset appears here once the indexer observes a Transfer log for its contract.",
  },
  wallet: {
    label: "AWAITING ACTIVITY",
    headline: "Awaiting observed activity",
    detail: "An address appears here as soon as a transfer involving it is indexed.",
  },
  protocol: {
    label: "CLASSIFICATION IN PROGRESS",
    headline: "Classification in progress",
    detail: "A counterparty is named only when its contract is identified. Until then it stays unclassified.",
  },
  network: {
    label: "CONNECTING",
    headline: "Connecting to Robinhood Chain",
    detail: "Reading the chain head directly over RPC.",
  },
  chart: {
    label: "LIVE FEED CONNECTING",
    headline: "Awaiting the first price observation",
    detail: "The series is built from real observations only. No candle is drawn until one exists.",
  },
  generic: {
    label: "INITIALIZING",
    headline: "Initializing",
    detail: "This surface fills in as the pipeline observes the chain.",
  },
};

/** What EMPTY means per surface: measured, and genuinely nothing there. */
const QUIET: Partial<Record<Surface, Omit<Presentation, "tone">>> = {
  flow: {
    label: "NO OBSERVED FLOW",
    headline: "No flow observed in this window",
    detail: "Nothing moved between addresses inside the period covered by the index.",
  },
  activity: {
    label: "NO OBSERVED ACTIVITY",
    headline: "No activity observed in this window",
    detail: "The index covered this period and recorded no transfers in it.",
  },
  wallet: {
    label: "NO OBSERVED ACTIVITY",
    headline: "No activity in the covered window",
    detail: "This address was not party to a transfer inside the period the index covers.",
  },
  topology: {
    label: "NO OBSERVED STRUCTURE",
    headline: "No relationships observed in this window",
    detail: "The map draws an edge only where value actually moved.",
  },
};

/**
 * Say a data state to a person.
 *
 * `surface` decides which sentence is the honest one — the same UNAVAILABLE is
 * a price that has not been observed, a graph with nothing to draw, or a
 * registry still filling, and those are three different things to a reader.
 */
export function present(state: DataState, surface: Surface = "generic"): Presentation {
  switch (state) {
    case "OK":
      return { label: "LIVE", headline: "Live", detail: "Measured and current.", tone: "live" };

    case "PARTIAL":
      return {
        label: "PARTIAL DATA",
        headline: "Partial coverage",
        detail:
          "The index covers less than this window claims, so every figure here is a lower bound over a shorter period.",
        tone: "partial",
      };

    case "STALE":
      return {
        label: "LAST OBSERVATION",
        headline: "Showing the last observation",
        detail: "This is a real measurement, older than the freshness budget. Its age is shown beside it.",
        tone: "partial",
      };

    case "EMPTY": {
      const quiet = QUIET[surface];
      if (quiet) return { ...quiet, tone: "quiet" };
      return {
        label: "NO OBSERVED ACTIVITY",
        headline: "Nothing observed here",
        detail: "The query succeeded and found nothing, which is a result rather than a fault.",
        tone: "quiet",
      };
    }

    // INDEXING and UNAVAILABLE read identically to a person: the value has not
    // been observed yet. Which of the two it is matters to an operator, and the
    // API keeps telling them.
    case "INDEXING":
    case "UNAVAILABLE":
    default:
      return { ...PENDING[surface], tone: "pending" };
  }
}

/**
 * How to say a state when there is NO VALUE in the slot.
 *
 * PARTIAL and STALE describe a measurement that exists — "a lower bound", "the
 * last observation". Said over an em dash they assert something that is not on
 * screen, which is the mirror image of fabricating a number: not a false value,
 * but a false claim that a value was obtained.
 *
 * So when the slot is empty, those two fall back to the surface's pending copy.
 * Nothing is being hidden — the state itself is unchanged and still drives the
 * API and every internal decision.
 */
export function presentMissing(state: DataState, surface: Surface = "generic"): Presentation {
  if (state === "PARTIAL" || state === "STALE" || state === "OK") {
    return { ...PENDING[surface], tone: "pending" };
  }
  return present(state, surface);
}

/** The short chip label — the most common need. */
export function presentLabel(state: DataState, surface: Surface = "generic"): string {
  return present(state, surface).label;
}

/**
 * Whether a state means "no value to show".
 *
 * Callers render an em dash for these. The dash is presentation; a number in
 * its place would not be.
 */
export function isAbsent(state: DataState): boolean {
  return state !== "OK" && state !== "STALE";
}
