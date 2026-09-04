import { NextResponse } from "next/server";
import { reasoningConfig, streamAnswer } from "@/lib/intelligence/providers/openrouter";
import { isInjectionAttempt, isSecretRequest, SECRET_RESPONSE, INJECTION_RESPONSE } from "@/lib/intelligence/fallback";

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

export async function POST(req: Request) {
  let payload: { question?: unknown; context?: unknown };
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

  const context =
    payload.context && typeof payload.context === "object"
      ? (payload.context as Record<string, unknown>)
      : undefined;

  const result = await streamAnswer(question, context, req.signal);

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
