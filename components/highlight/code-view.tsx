"use client";

import { useEffect, useRef } from "react";

import type { HighlightSpan } from "@/lib/highlight/types";
import { ROLE_LABELS } from "@/lib/highlight/types";
import type { Severity } from "@/lib/lint/types";
import { cn } from "@/lib/utils";

/**
 * The rendered source, one row per line.
 *
 * Every span carries its role in a data attribute and takes its colour from the
 * stylesheet, so there is no class-per-role table in here and an unknown role
 * simply renders unstyled. Lines carry their severity the same way, which is
 * what lets a diagnostic tint a row without the renderer knowing what a rule is.
 */

/** Below this the distribution was spread enough to be worth showing on screen. */
const UNCERTAIN_BELOW = 0.6;

/**
 * Splits spans at newlines so each line is its own row. Whitespace runs and
 * block comments are the spans that cross lines; both halves keep the same
 * judgement, so clicking either still selects the one answer behind them.
 */
function toLines(spans: HighlightSpan[]): HighlightSpan[][] {
  const lines: HighlightSpan[][] = [[]];

  for (const span of spans) {
    if (!span.text.includes("\n")) {
      lines[lines.length - 1].push(span);
      continue;
    }
    span.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1].push({ ...span, text: part });
    });
  }

  return lines;
}

interface Props {
  spans: HighlightSpan[];
  /** Confidence per judgement index, when the judgements have arrived. */
  confidenceOf?: (judgement: number) => number | undefined;
  selected: number | null;
  onSelect: (judgement: number | null) => void;
  /** Dims the words that Jev has not answered for yet. */
  pending?: boolean;
  /** Worst severity reported on a 1-based line, if any. */
  severityOf?: (line: number) => Severity | undefined;
  /** The diagnostic's line, scrolled into view and held highlighted. */
  activeLine?: number | null;
}

export function CodeView({
  spans,
  confidenceOf,
  selected,
  onSelect,
  pending = false,
  severityOf,
  activeLine = null,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const lines = toLines(spans);

  useEffect(() => {
    if (activeLine === null) return;
    const view = container.current;
    const row = view?.querySelector(`[data-line-number="${activeLine}"]`);
    if (!view || !row) return;

    // Scrolled by hand rather than with scrollIntoView, which also scrolls every
    // ancestor: clicking a finding should move the code, not jump the page.
    const rowBox = row.getBoundingClientRect();
    const viewBox = view.getBoundingClientRect();
    view.scrollBy({
      top: rowBox.top - viewBox.top - view.clientHeight / 2 + rowBox.height / 2,
      behavior: "smooth",
    });
  }, [activeLine]);

  return (
    <div ref={container} className="h-full overflow-auto">
      <div className="w-max min-w-full py-3 font-mono text-[0.78rem] leading-[1.7]">
        {lines.map((line, index) => {
          const number = index + 1;
          return (
            <div
              key={number}
              data-line=""
              data-line-number={number}
              data-severity={severityOf?.(number)}
              data-active={activeLine === number}
              className="flex"
            >
              <span className="text-muted-foreground/50 sticky left-0 w-11 shrink-0 bg-inherit pr-3 text-right tabular-nums select-none">
                {number}
              </span>
              <code className="pr-4 whitespace-pre">
                {line.map((span, spanIndex) => {
                  if (span.judgement === undefined) {
                    return (
                      <span
                        key={spanIndex}
                        data-role={span.role}
                        className={cn(pending && span.role === "other" && "opacity-40")}
                      >
                        {span.text}
                      </span>
                    );
                  }

                  const judgement = span.judgement;
                  const confidence = confidenceOf?.(judgement);
                  return (
                    <button
                      key={spanIndex}
                      type="button"
                      data-role={span.role}
                      data-selected={selected === judgement}
                      data-uncertain={confidence !== undefined && confidence < UNCERTAIN_BELOW}
                      title={`${ROLE_LABELS[span.role]}${
                        confidence === undefined ? "" : ` · confidence ${confidence.toFixed(2)}`
                      }`}
                      onClick={() => onSelect(selected === judgement ? null : judgement)}
                      className="inline cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] focus-visible:outline-2"
                    >
                      {span.text}
                    </button>
                  );
                })}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
