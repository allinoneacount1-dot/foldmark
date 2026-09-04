/**
 * Ingestion, paused by decision.
 *
 * SERVER ONLY.
 *
 * WHY THIS EXISTS. FOLDMARK ingests continuously against a fixed free-tier
 * storage ceiling. Measured: about 509,000 transfer rows a day at 508 bytes a
 * row, which is roughly 246 MB a day against a 500 MB limit — so the index can
 * hold about two days of chain and no more. The owner chose to stop ingesting
 * and keep what exists rather than delete real history or pay for storage.
 *
 * THE DISTINCTION THIS FILE PROTECTS. A paused index and a broken index look
 * identical from the outside: both stop advancing. They are completely
 * different facts, and the wrong one is worse in both directions — reporting a
 * fault when someone made a decision sends people looking for a bug that is not
 * there, and reporting health when the index has silently stopped is exactly
 * how a stalled pipeline gets mistaken for a quiet chain.
 *
 * So pausing is explicit, it is stated everywhere freshness is claimed, and it
 * is a state of its own rather than an absence.
 */

/**
 * Whether this deployment has been told to stop advancing the index.
 *
 * Read from the environment rather than a database flag on purpose: the reason
 * to pause is usually that the database is the problem, and a switch that needs
 * the database to work is a switch that fails when it is needed.
 */
export function ingestionPaused(): boolean {
  const raw = process.env.INGEST_PAUSED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Why, in the reader's terms.
 *
 * The reason travels with the state everywhere it is reported. "Paused" on its
 * own invites the assumption that something went wrong.
 */
export const PAUSE_REASON =
  "Ingestion is paused by decision, not by failure. The index holds what it had already observed and is not advancing; the chain head shown elsewhere is read live over RPC and is unaffected. Nothing has been deleted, and no figure here is estimated to fill the gap.";
