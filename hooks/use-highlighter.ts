"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LanguageDetection, TokenClassification } from "@/lib/agent/highlight-jev";
import { lex, lexicalSpans } from "@/lib/highlight/lexer";
import { MAX_SOURCE_CHARS, type HighlightSpan } from "@/lib/highlight/types";
import type { LintResult, Severity } from "@/lib/lint/types";

/**
 * Drives the rounds in the only order they can run in.
 *
 * The language has to come back first: both the token questions and the lint
 * rules name it. Those two do not depend on each other, though, so they go out
 * together and land independently — the highlighting does not wait on the lint,
 * and a lint failure does not take the highlighting with it.
 *
 * Between the rounds the lexer runs in the browser on the same source with the
 * same rules as the server, which is what puts comments, strings and numbers on
 * screen in their final colours before the token questions come back.
 */

export type HighlightStage = "idle" | "detecting" | "classifying" | "done" | "error";

/** Anything the server may have served from cache rather than recomputed. */
export type Cacheable<T> = T & { cached?: boolean };

export interface HighlighterController {
  stage: HighlightStage;
  detection: Cacheable<LanguageDetection> | null;
  classification: Cacheable<TokenClassification> | null;
  lint: Cacheable<LintResult> | null;
  lintPending: boolean;
  /** Kept apart from `error`: the lint can fail without losing the highlighting. */
  lintError: string | null;
  /** Worst severity reported on a 1-based line, if any. */
  severityOf: (line: number) => Severity | undefined;
  /** Lexer-only spans, available as soon as the language is known. */
  preview: HighlightSpan[] | null;
  /** The exact text the spans describe, which may be a prefix of what was sent. */
  source: string;
  truncated: boolean;
  error: string | null;
  elapsedMs: number;
  run: (source: string) => void;
  reset: () => void;
}

interface Payload {
  error?: string;
  truncated?: boolean;
  /** True when the server had this answer already and asked Jev nothing. */
  cached?: boolean;
}

async function post<T extends Payload>(url: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json()) as T;
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

export function useHighlighter(): HighlighterController {
  const [stage, setStage] = useState<HighlightStage>("idle");
  const [detection, setDetection] = useState<Cacheable<LanguageDetection> | null>(null);
  const [classification, setClassification] = useState<Cacheable<TokenClassification> | null>(null);
  const [lint, setLint] = useState<Cacheable<LintResult> | null>(null);
  const [lintPending, setLintPending] = useState(false);
  const [lintError, setLintError] = useState<string | null>(null);
  const [preview, setPreview] = useState<HighlightSpan[] | null>(null);
  const [source, setSource] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const inFlight = useRef<AbortController | null>(null);

  const running = stage === "detecting" || stage === "classifying" || lintPending;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setStage("idle");
    setDetection(null);
    setClassification(null);
    setLint(null);
    setLintPending(false);
    setLintError(null);
    setPreview(null);
    setSource("");
    setTruncated(false);
    setError(null);
    setStartedAt(null);
    setStoppedAt(null);
  }, []);

  const run = useCallback((input: string) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStage("detecting");
    setDetection(null);
    setClassification(null);
    setLint(null);
    setLintPending(true);
    setLintError(null);
    setPreview(null);
    setSource(input.slice(0, MAX_SOURCE_CHARS));
    setTruncated(false);
    setError(null);
    const at = Date.now();
    setStartedAt(at);
    setStoppedAt(null);
    setNow(at);

    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "The request failed.");
      setStage("error");
      setStoppedAt(Date.now());
    };

    void (async () => {
      let language: LanguageDetection & Payload;
      try {
        language = await post<LanguageDetection & Payload>(
          "/api/agent/highlight/language",
          { source: input },
          controller.signal,
        );
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setLintPending(false);
        fail(cause);
        return;
      }
      if (controller.signal.aborted) return;

      // The server truncates oversized input, so the spans that come back
      // describe a prefix. Follow it exactly rather than rendering more text
      // than was actually classified.
      const text = input.slice(0, MAX_SOURCE_CHARS);
      setDetection(language);
      setTruncated(Boolean(language.truncated));
      setPreview(lexicalSpans(lex(text, language.language, language.commentStyle)));
      setStage("classifying");

      const body = {
        source: input,
        language: language.language,
        commentStyle: language.commentStyle,
      };

      // Both only needed the language, so neither waits for the other.
      const tokenFlow = post<TokenClassification & Payload>(
        "/api/agent/highlight/tokens",
        body,
        controller.signal,
      )
        .then((tokens) => {
          if (controller.signal.aborted) return;
          setClassification(tokens);
          setSource(tokens.spans.map((span) => span.text).join(""));
          setStage("done");
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          fail(cause);
        });

      const lintFlow = post<LintResult & Payload>("/api/agent/lint", body, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setLint(result);
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setLintError(cause instanceof Error ? cause.message : "The lint request failed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLintPending(false);
        });

      await Promise.allSettled([tokenFlow, lintFlow]);
      if (!controller.signal.aborted) setStoppedAt(Date.now());
    })();
  }, []);

  // The worst severity on each line, so the code view can tint a row without
  // holding the diagnostics itself.
  const worst = new Map<number, Severity>();
  for (const diagnostic of lint?.diagnostics ?? []) {
    // `diagnostics` arrives sorted most severe first, so the first one on a
    // line is the one that should colour it.
    if (!worst.has(diagnostic.line)) worst.set(diagnostic.line, diagnostic.severity);
  }

  return {
    stage,
    detection,
    classification,
    lint,
    lintPending,
    lintError,
    severityOf: (line: number) => worst.get(line),
    preview,
    source,
    truncated,
    error,
    elapsedMs: startedAt === null ? 0 : Math.max(0, (stoppedAt ?? now) - startedAt),
    run,
    reset,
  };
}
