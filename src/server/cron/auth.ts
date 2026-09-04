/**
 * Who may drive a scheduled job.
 *
 * SERVER ONLY.
 *
 * THE HOLE THIS CLOSED. Both cron endpoints used to accept any request that
 * carried an `x-vercel-cron` header, on the assumption that only Vercel's own
 * scheduler could set it. Anyone can set a header. A single unauthenticated
 * curl carrying that name drove a real ingestion pass against production —
 * free-tier RPC quota, database writes and function time, all spendable by a
 * stranger, repeatedly. The presence of a header is not authentication and
 * never was.
 *
 * The check lives here rather than beside each route because it was copied
 * once and both copies had the same hole. A rule about who may spend money
 * should exist in exactly one place.
 */

/**
 * Constant-time comparison.
 *
 * `===` on a secret leaks its prefix through timing. Doing this properly costs
 * microseconds; the alternative is an oracle.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True only for a request carrying a configured secret.
 *
 * Two are accepted, and both must be presented as a value rather than inferred
 * from a request's shape: INGEST_SECRET, which the Supabase scheduler sends,
 * and CRON_SECRET, which Vercel's scheduler sends as a bearer token when that
 * variable is set. With neither configured nothing is authorized, so a
 * deployment holding no secrets cannot be driven at all — which is the correct
 * default for an endpoint that spends a quota.
 */
export function cronAuthorized(req: Request): boolean {
  const secrets = [process.env.INGEST_SECRET?.trim(), process.env.CRON_SECRET?.trim()].filter(
    (s): s is string => Boolean(s),
  );
  if (!secrets.length) return false;

  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  /**
   * The query parameter is kept because the running scheduler uses it, but it
   * is the weaker channel: a URL reaches access logs and referrer headers in a
   * way an Authorization header does not. Prefer the header for anything new.
   */
  const param = new URL(req.url).searchParams.get("key")?.trim();

  return secrets.some((s) => (header ? sameSecret(header, s) : false) || (param ? sameSecret(param, s) : false));
}
