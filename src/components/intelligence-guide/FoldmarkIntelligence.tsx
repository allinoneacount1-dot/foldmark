"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { IntelligenceLauncher } from "@/components/intelligence-guide/IntelligenceLauncher";
import { IntelligencePanel } from "@/components/intelligence-guide/IntelligencePanel";
import type { Turn } from "@/components/intelligence-guide/IntelligenceMessage";
import { ask, answerById } from "@/lib/intelligence/engine";
import { greetingFor } from "@/lib/intelligence/greeting";
import { entryById } from "@/lib/intelligence/knowledge";
import type { PageContext, SessionContext } from "@/lib/intelligence/types";

/**
 * FOLDMARK Intelligence.
 *
 * Owns the conversation and decides which layer answers.
 *
 * ROUTING. The static knowledge base is tried first and always. When it answers
 * confidently the reply is instant and involves no network at all — canonical
 * product semantics are fixed text and must not vary between readings. Only
 * when the knowledge base is unsure does the question go to the reasoning
 * endpoint, and if that endpoint is missing, slow or failing, the static answer
 * that was already computed is shown instead. The guide degrades to deterministic;
 * it never degrades to broken.
 *
 * The reader is told which layer answered. A generated reply is labelled
 * REASONING, because the difference between text a person wrote and text a model
 * produced is exactly the sort of thing this product refuses to blur.
 */

let turnSeq = 0;
const nextId = () => `t${(turnSeq += 1)}`;

type Reasoning = { enabled: boolean; model: string | null };

export function FoldmarkIntelligence() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasoning, setReasoning] = useState<Reasoning>({ enabled: false, model: null });
  const session = useRef<SessionContext>({});
  const abort = useRef<AbortController | null>(null);

  /**
   * Route state is DERIVED, never mirrored into state of its own.
   *
   * The filters on Fabric and Flows change the query string without changing
   * the pathname, so the guide has to react to the search params themselves or
   * it would describe a view the reader has already navigated away from. This
   * hook is why the component is mounted inside a Suspense boundary: without
   * one it would opt every page that renders it out of static rendering.
   */
  const searchParams = useSearchParams();

  const page: PageContext = useMemo(() => {
    const params: Record<string, string> = {};
    for (const [k, v] of searchParams.entries()) params[k] = v;
    return { pathname, params };
  }, [pathname, searchParams]);

  const greeting = useMemo(() => greetingFor(page), [page]);

  /**
   * Ask the server once whether a reasoning layer is configured. It answers with
   * a boolean and a model name and never with anything sensitive; the key stays
   * on the server and is not part of this response.
   */
  useEffect(() => {
    if (!open || reasoning.enabled) return;
    let cancelled = false;
    fetch("/api/intelligence", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.enabled === "boolean") {
          setReasoning({ enabled: d.enabled, model: d.model ?? null });
        }
      })
      .catch(() => {
        /* Absent endpoint simply means static-only. Not an error worth showing. */
      });
    return () => {
      cancelled = true;
    };
  }, [open, reasoning.enabled]);

  const statusLabel = reasoning.enabled
    ? `PRODUCT KNOWLEDGE · DETERMINISTIC + REASONING${reasoning.model ? ` · ${reasoning.model.toUpperCase()}` : ""}`
    : "PRODUCT KNOWLEDGE · DETERMINISTIC · LOCAL";

  const followups = useMemo(() => {
    const last = [...turns].reverse().find((t) => t.role === "guide");
    if (!last || last.role !== "guide") return [];
    const entry = last.intentId ? entryById(last.intentId) : null;
    if (!entry?.followups?.length) return last.followups ?? [];
    return (last.followups ?? []).slice(0, 4);
  }, [turns]);

  const push = useCallback((turn: Turn) => setTurns((t) => [...t, turn]), []);

  /**
   * Stream a reasoning answer into an existing guide turn.
   *
   * Returns true when at least one character arrived. A stream that fails before
   * producing anything is treated as no answer at all, so the caller can fall
   * back to the deterministic reply it already has rather than leaving an empty
   * message on screen.
   */
  const streamReasoning = useCallback(
    async (question: string, turnId: string): Promise<boolean> => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch("/api/intelligence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          /**
           * The browser sends WHERE the reader is, never WHAT is true there.
           *
           * Route and query string only. Every measurement in the prompt is
           * resolved on the server from FOLDMARK's own index, so a crafted
           * request cannot put a figure in front of the model and have it
           * repeated back as an observation.
           */
          body: JSON.stringify({ question, page: { pathname: page.pathname, params: page.params } }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return false;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let received = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          received += chunk;
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId && t.role === "guide" ? { ...t, text: received, streaming: true } : t,
            ),
          );
        }

        if (!received.trim()) return false;
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId && t.role === "guide" ? { ...t, text: received, streaming: false } : t)),
        );
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
        if (abort.current === controller) abort.current = null;
      }
    },
    [page],
  );

  const submit = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;

      push({ id: nextId(), role: "user", text });
      setDraft("");
      setBusy(true);

      // The deterministic answer is computed first, every time. It is either the
      // reply or the safety net for the reply.
      const staticResponse = ask(text, page, session.current, {
        reasoningEnabled: reasoning.enabled,
        modelName: reasoning.model ?? undefined,
      });

      const canonical =
        staticResponse.level === "HIGH" ||
        Boolean(staticResponse.intentId?.startsWith("safety.")) ||
        Boolean(staticResponse.intentId?.startsWith("command."));

      if (staticResponse.intentId) {
        const entry = entryById(staticResponse.intentId);
        session.current = {
          lastIntentId: staticResponse.intentId,
          lastDomain: entry?.domain ?? session.current.lastDomain,
        };
      }

      const turnId = nextId();

      if (canonical || !reasoning.enabled) {
        push({
          id: turnId,
          role: "guide",
          text: staticResponse.answer,
          contextLine: staticResponse.contextLine,
          actions: staticResponse.actions,
          level: staticResponse.level,
          followups: staticResponse.followups,
          intentId: staticResponse.intentId,
          source: "static",
        });
        setBusy(false);
        return;
      }

      // Uncertain: hand it to the reasoning layer, keeping the static reply ready.
      push({ id: turnId, role: "guide", text: "", source: "reasoning", streaming: true });
      const ok = await streamReasoning(text, turnId);
      if (!ok) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId && t.role === "guide"
              ? {
                  ...t,
                  text: staticResponse.answer,
                  actions: staticResponse.actions,
                  level: staticResponse.level,
                  followups: staticResponse.followups,
                  intentId: staticResponse.intentId,
                  source: "static",
                  streaming: false,
                }
              : t,
          ),
        );
      }
      setBusy(false);
    },
    [busy, page, push, reasoning.enabled, reasoning.model, streamReasoning],
  );

  /** A chip resolves straight to its entry — no matching, no network. */
  const pick = useCallback(
    (id: string, label: string) => {
      const response = answerById(id);
      if (!response) return;
      const entry = entryById(id);
      session.current = { lastIntentId: id, lastDomain: entry?.domain };
      push({ id: nextId(), role: "user", text: label });
      push({
        id: nextId(),
        role: "guide",
        text: response.answer,
        actions: response.actions,
        followups: response.followups,
        intentId: response.intentId,
        source: "static",
      });
    },
    [push],
  );

  const clear = useCallback(() => {
    abort.current?.abort();
    setTurns([]);
    setDraft("");
    setBusy(false);
    session.current = {};
  }, []);

  const close = useCallback(() => {
    abort.current?.abort();
    setOpen(false);
    setMinimized(false);
    setBusy(false);
  }, []);

  /** Cmd/Ctrl + / toggles. Cmd+K is left alone: site search already owns it. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
        setMinimized(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const showPanel = open && !minimized;

  return (
    <>
      <IntelligenceLauncher
        hidden={showPanel}
        onOpen={() => {
          setOpen(true);
          setMinimized(false);
        }}
      />
      {showPanel ? (
        <IntelligencePanel
          turns={turns}
          greeting={greeting.lead}
          suggestions={greeting.suggestions}
          followups={followups}
          draft={draft}
          busy={busy}
          statusLabel={statusLabel}
          onDraftChange={setDraft}
          onSend={() => void submit(draft)}
          onPick={pick}
          onClear={clear}
          onMinimize={() => setMinimized(true)}
          onClose={close}
        />
      ) : null}
    </>
  );
}
