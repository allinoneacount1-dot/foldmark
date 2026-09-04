import { NextResponse } from "next/server";
import { reasoningConfig, streamAnswer } from "@/lib/intelligence/providers/openrouter";
import { isInjectionAttempt, isSecretRequest, SECRET_RESPONSE, INJECTION_RESPONSE } from "@/lib/intelligence/fallback";
import { contextSnapshot } from "@/lib/intelligence/context";
import { liveContext } from "@/server/intelligence/live-context";

/**
 * The reasoning endpoint.
 *
 * The ONLY path between the browser and the model provider. The API key lives
 * here and in the environment; it is never sent to the client, never included in
 * a response body, and never logged. GET reports whether a provider is
 * configured — a boolean and a model name, nothing else.
 *
 * This endpoint answers open-ended questions only. Canonical product semantics
 * are served from the static knowledge base in the client without touching the
 * network, so the definition of DEX_BUY cannot vary between two readings of it.
 */

export const runtime = "nodejs";
/** Never cached: the answer depends on the reader's question and page. */
export const dynamic = "force-dynamic";

const MAX_QUESTION_LENGTH = 600;

/**
 * A small per-instance throttle.
 *
 * Serverless means this is per warm instance rather than global, so it is a
 * brake and not a guarantee. It exists to stop a single tab from looping the
 * endpoint, which is the realistic failure here — not to be an access control.
 */
const BUCKET = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 20;
const WINDOW_MS = 60_000;

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = BUCKET.get(key);
  if (!entry || now > entry.resetAt) {
    BUCKET.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > LIMIT) return true;
  // Opportunistic cleanup so the map cannot grow without bound.
  if (BUCKET.size > 500) {
    for (const [k, v] of BUCKET) if (now > v.resetAt) BUCKET.delete(k);
  }
  return false;
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
}

/** Capability probe. Reports presence, never the secret. */
export function GET() {
  const config = reasoningConfig();
  return NextResponse.json(
    { enabled: config.enabled, model: config.enabled ? config.model : null },
    { headers: { "cache-control": "no-store" } },
  );
}

const TEXT_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: TEXT_HEADERS });
}

const MAX_PATH_LENGTH = 200;
const MAX_PARAM_LENGTH = 64;

/**
 * A pathname the reader could actually be on.
 *
 * Anything else becomes "/". This is not defence against a malformed URL — it
 * is defence against a sentence. The pathname is interpolated into the model's
 * prompt, so a caller who could put arbitrary prose in this field could write
 * instructions there, and a caller who could put arbitrary length in it could
 * push the real state out of the context window.
 */
export function safePath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const path = value.trim();
  if (!path.startsWith("/") || path.length > MAX_PATH_LENGTH) return "/";
  return /^[/A-Za-z0-9._~-]*$/.test(path) ? path : "/";
}

/**
 * The four filters the product reads from the query string, and nothing else.
 *
 * An unknown key is dropped rather than passed through: the prompt states the
 * reader's filters as fact, and an arbitrary key/value pair would be an
 * arbitrary fact.
 */
const PARAM_KEYS = ["w", "category", "flow", "type"] as const;

export function safeParams(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  const source = value as Record<string, unknown>;
  for (const key of PARAM_KEYS) {
    const raw = source[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_PARAM_LENGTH) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) continue;
    out[key] = trimmed;
  }
  return out;
}

export async function POST(req: Request) {
  let payload: { question?: unknown; page?: unknown };
  try {
    payload = await req.json();
  } catch {
    return textResponse("", 400);
  }

  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  if (!question) return textResponse("", 400);
  if (question.length > MAX_QUESTION_LENGTH) return textResponse("", 413);

  /**
   * The safety branches are enforced here as well as in the client.
   *
   * The client checks them so the answer is instant, but this endpoint is
   * reachable directly, and a request that tries to talk to the prompt or to
   * read configuration must not be forwarded to a provider.
   */
  if (isSecretRequest(question)) return textResponse(SECRET_RESPONSE);
  if (isInjectionAttempt(question)) return textResponse(INJECTION_RESPONSE);

  if (throttled(clientKey(req))) return textResponse("", 429);

  /**
   * The reader supplies a LOCATION. The server supplies the FACTS.
   *
   * Nothing measured is accepted from the browser. The request carries a
   * pathname and a filter set; every figure that reaches the model is resolved
   * here, from FOLDMARK's own index, on this request. A caller who posts
   * `indexed_transfers: 9000000` gets it discarded rather than quoted back to
   * them as an observation — which is the failure this product exists to avoid,
   * arriving through the one endpoint that talks to a model.
   */
  const page = (payload.page ?? {}) as Record<string, unknown>;
  const pathname = safePath(page.pathname);
  const params = safeParams(page.params);

  /**
   * A database that will not answer must not stop the guide answering.
   *
   * The route facts are derived from the URL and always available; the measured
   * half is best-effort. Losing it means the model reasons about structure
   * without figures, which is a smaller failure than no reply at all.
   */
  let live: Record<string, unknown> = {};
  try {
    live = await liveContext(pathname, params);
  } catch {
    live = { index_status: "UNAVAILABLE — the index could not be read on this request" };
  }

  const context = { ...contextSnapshot({ pathname, params }), ...live };

  const result = await streamAnswer(question, { pathname, params }, context, req.signal);

  /**
   * A provider failure returns an empty 204 rather than an error message.
   *
   * The client already holds the deterministic answer for this question and
   * shows it when nothing arrives. Sending prose here would overwrite a correct
   * static answer with an apology.
   */
  if (!result.ok) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

  return new Response(result.stream, { headers: TEXT_HEADERS });
}
