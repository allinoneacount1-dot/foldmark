/**
 * FOLDMARK data-state model.
 *
 * Hard rule: a number reaches the screen only when it was derived from indexed
 * chain data. Everything else resolves to a state, never a plausible-looking value.
 */

export type DataState =
  | "OK" //          measured, fresh
  | "PARTIAL" //     measured, but the window is not fully indexed
  | "STALE" //       measured, but older than the freshness budget
  | "EMPTY" //       query succeeded, nothing observed yet
  | "INDEXING" //    the pipeline has not reached this entity
  | "UNAVAILABLE"; // source is down or unconfigured

export const STATE_LABEL: Record<DataState, string> = {
  OK: "LIVE",
  PARTIAL: "PARTIAL DATA",
  STALE: "STALE",
  EMPTY: "NO ACTIVITY",
  INDEXING: "INDEXING",
  UNAVAILABLE: "DATA UNAVAILABLE",
};

export type Provenance = {
  /** Human name of where the value came from, e.g. "Robinhood Chain RPC". */
  source: string;
  /** How it was computed, one sentence. Shown in methodology surfaces. */
  method?: string;
};

export type Measured<T> = {
  state: DataState;
  value: T | null;
  observedAt: string | null;
  provenance: Provenance;
  note?: string;
};

export function measured<T>(
  value: T | null | undefined,
  provenance: Provenance,
  opts: { observedAt?: string | null; state?: DataState; note?: string } = {},
): Measured<T> {
  const missing = value === null || value === undefined;
  return {
    state: opts.state ?? (missing ? "INDEXING" : "OK"),
    value: missing ? null : value,
    observedAt: opts.observedAt ?? null,
    provenance,
    note: opts.note,
  };
}

export function unavailable<T>(provenance: Provenance, note?: string): Measured<T> {
  return { state: "UNAVAILABLE", value: null, observedAt: null, provenance, note };
}

export function indexing<T>(provenance: Provenance, note?: string): Measured<T> {
  return { state: "INDEXING", value: null, observedAt: null, provenance, note };
}

/** A measured value is renderable as a number only in these states. */
export function hasValue<T>(m: Measured<T>): m is Measured<T> & { value: T } {
  return m.value !== null && (m.state === "OK" || m.state === "PARTIAL" || m.state === "STALE");
}

/** Freshness budget: how old an observation may be before it reads as STALE. */
export const FRESHNESS_BUDGET_MS = 15 * 60 * 1000;

export function withFreshness<T>(m: Measured<T>, now: number): Measured<T> {
  if (!hasValue(m) || !m.observedAt) return m;
  const age = now - new Date(m.observedAt).getTime();
  return age > FRESHNESS_BUDGET_MS ? { ...m, state: "STALE" } : m;
}
