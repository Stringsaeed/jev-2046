"use client";

import { AlertTriangle, CircleAlert, Info, Loader2 } from "lucide-react";

import { Pane } from "@/components/highlight/pane";
import type { HighlighterController } from "@/hooks/use-highlighter";
import { SEVERITY_LABELS, type Diagnostic, type Severity } from "@/lib/lint/types";
import { cn } from "@/lib/utils";

/**
 * The third panel: what the rules found.
 *
 * Both halves of the linter are on show here — the gate, which is one whole-file
 * question per rule and closes most of them for free, and the findings, which
 * are the lines that survived being asked about individually.
 */

const ICONS: Record<Severity, typeof CircleAlert> = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
};

function Finding({
  diagnostic,
  active,
  onSelect,
}: {
  diagnostic: Diagnostic;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = ICONS[diagnostic.severity];

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-severity={diagnostic.severity}
        className={cn(
          "hover:bg-muted/60 w-full rounded-lg px-2 py-1.5 text-left transition-colors",
          active && "bg-muted",
        )}
      >
        <span className="flex items-center gap-1.5">
          <Icon
            className="size-3.5 shrink-0"
            aria-label={SEVERITY_LABELS[diagnostic.severity]}
            style={{ color: `var(--lint-${diagnostic.severity})` }}
          />
          <span className="truncate text-xs font-medium">{diagnostic.title}</span>
          <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[0.65rem] tabular-nums">
            L{diagnostic.line} · {diagnostic.probability.toFixed(2)}
          </span>
        </span>
        <code className="text-muted-foreground mt-0.5 block truncate pl-5 font-mono text-[0.65rem]">
          {diagnostic.text}
        </code>
      </button>
    </li>
  );
}

interface Props {
  highlighter: HighlighterController;
  activeLine: number | null;
  onSelectLine: (line: number | null) => void;
}

export function LintPanel({ highlighter, activeLine, onSelectLine }: Props) {
  const { lint, lintPending, lintError } = highlighter;

  const errors = lint?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const warnings = lint?.diagnostics.filter((d) => d.severity !== "error").length ?? 0;

  return (
    <Pane
      title="Lint"
      trailing={
        lint ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[0.65rem] tabular-nums">
            {errors} error{errors === 1 ? "" : "s"} · {warnings} warning
            {warnings === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3">
        {lintError ? (
          <p className="text-destructive text-sm">{lintError}</p>
        ) : lintPending ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            Gating nine rules against the file, then the lines that survive.
          </p>
        ) : !lint ? (
          <p className="text-muted-foreground text-sm">
            Nine rules, written in code. Jev decides which of them this file actually breaks, and
            where.
          </p>
        ) : (
          <>
            {lint.diagnostics.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing met the bar. Every rule was put to the file, and the ones that looked
                possible were read line by line.
              </p>
            ) : (
              <ul className="-mx-1 flex flex-col gap-0.5">
                {lint.diagnostics.map((diagnostic) => (
                  <Finding
                    key={`${diagnostic.rule}-${diagnostic.line}`}
                    diagnostic={diagnostic}
                    active={activeLine === diagnostic.line}
                    onSelect={() =>
                      onSelectLine(activeLine === diagnostic.line ? null : diagnostic.line)
                    }
                  />
                ))}
              </ul>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-[0.7rem] font-semibold tracking-wide uppercase">
                Gate
              </h3>
              <ul className="flex flex-col gap-1">
                {lint.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      !rule.searched && "text-muted-foreground/60",
                    )}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: rule.searched
                          ? `var(--lint-${rule.severity})`
                          : "var(--color-muted-foreground)",
                        opacity: rule.searched ? 1 : 0.4,
                      }}
                    />
                    <span className="truncate">{rule.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[0.65rem] tabular-nums">
                      {rule.probability.toFixed(2)}
                      <span className="text-muted-foreground/70">
                        {rule.searched ? ` · ${rule.candidates} lines` : " · closed"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-[0.7rem]">
                {lint.stats.gateQuestions} whole-file questions in {lint.stats.gateMs}ms closed the
                rules this file cannot break; {lint.stats.lineQuestions} line questions in{" "}
                {lint.stats.lineMs}ms settled the rest.
              </p>
              {lint.stats.capped && (
                <p className="text-muted-foreground text-[0.7rem]">
                  The line pass hit its question limit, so some candidate lines were not asked
                  about.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </Pane>
  );
}
