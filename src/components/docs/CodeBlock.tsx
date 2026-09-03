"use client";

import { useState } from "react";
import { IconCopy, IconCheck } from "@/components/icons";

/**
 * A code block with a language label and a working copy button.
 *
 * Highlighting is deliberately minimal — a token-level colouriser for the two
 * languages the docs actually use — so no highlighting library ships to the
 * client for a handful of snippets.
 */
export function CodeBlock({
  language,
  code,
  caption,
}: {
  language: "bash" | "json" | "ts" | "js" | "text";
  code: string;
  caption?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="border border-rule">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule bg-surface px-3 py-2">
        <span className="label-s">{caption ?? language.toUpperCase()}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint m-fast hover:text-ink"
        >
          {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
          {copied ? "COPIED" : "COPY"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-data-s leading-relaxed">
        <code>{highlight(code, language)}</code>
      </pre>
    </figure>
  );
}

function highlight(code: string, language: string) {
  if (language === "json") {
    return code.split("\n").map((line, i) => (
      <span key={i} className="block">
        {jsonLine(line)}
      </span>
    ));
  }
  if (language === "bash") {
    return code.split("\n").map((line, i) => (
      <span key={i} className="block text-ink-muted">
        {line.startsWith("#") ? <span className="text-ink-faint">{line}</span> : bashLine(line)}
      </span>
    ));
  }
  return <span className="text-ink-muted">{code}</span>;
}

function jsonLine(line: string) {
  const match = line.match(/^(\s*)"([^"]+)":\s?(.*)$/);
  if (!match) return <span className="text-ink-muted">{line}</span>;
  const [, indent, key, rest] = match;
  return (
    <>
      {indent}
      <span className="text-ink">&quot;{key}&quot;</span>
      <span className="text-ink-faint">: </span>
      <span className={/^"/.test(rest) ? "text-signal" : "text-ink-muted"}>{rest}</span>
    </>
  );
}

function bashLine(line: string) {
  const [head, ...rest] = line.split(" ");
  return (
    <>
      <span className="text-signal">{head}</span>
      {rest.length ? <span className="text-ink-muted"> {rest.join(" ")}</span> : null}
    </>
  );
}
