"use client";

import { Check, Loader2 } from "lucide-react";

import { formatDuration } from "@/components/agent/agent-panel";
import type { HighlighterController } from "@/hooks/use-highlighter";
import { SEMANTIC_ROLES, ROLE_LABELS } from "@/lib/highlight/types";
import type { SemanticRole } from "@/lib/highlight/types";
import { cn } from "@/lib/utils";

/** Everything Jev actually said, next to the code it said it about. */

function Bar({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 shrink-0 truncate text-[0.7rem]">{label}</span>
      <span className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(value * 100, value > 0 ? 1.5 : 0)}%`,
            backgroundColor: tint ?? "var(--foreground)",
          }}
        />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[0.65rem] tabular-nums">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-[0.7rem] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Step({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: "waiting" | "running" | "done";
}) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          state === "done" && "border-emerald-500/40 bg-emerald-500/15 text-emerald-600",
          state === "waiting" && "text-muted-foreground/50",
        )}
      >
        {state === "running" ? (
          <Loader2 className="size-3 animate-spin" />
        ) : state === "done" ? (
          <Check className="size-2.5" />
        ) : null}
      </span>
      <span className={cn("font-medium", state === "waiting" && "text-muted-foreground/60")}>
        {label}
      </span>
      <span className="text-muted-foreground ml-auto font-mono text-[0.65rem]">{detail}</span>
    </li>
  );
}

const ROLE_TINT = (role: string) => `var(--syn-${role})`;

export function HighlightPanel({
  highlighter,
  selected,
}: {
  highlighter: HighlighterController;
  selected: number | null;
}) {
  const { stage, detection, classification, lint, lintPending } = highlighter;
  const judgement = selected === null ? undefined : classification?.judgements[selected];

  const languageBars = Object.entries(detection?.probabilities ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const counts = new Map<SemanticRole, number>();
  for (const span of classification?.spans ?? []) {
    if (span.judgement === undefined) continue;
    counts.set(span.role as SemanticRole, (counts.get(span.role as SemanticRole) ?? 0) + 1);
  }

  const stats = classification
    ? [
        { label: "Tokens", value: String(classification.stats.tokens) },
        { label: "Words", value: String(classification.stats.words) },
        { label: "Questions", value: String(classification.stats.questions) },
        {
          label: "Requests",
          value: String(classification.stats.requests + 1 + (lint?.stats.requests ?? 0)),
        },
        { label: "Elapsed", value: formatDuration(highlighter.elapsedMs) },
        {
          label: "Model tokens",
          value: String(
            (detection?.usage.totalTokens ?? 0) +
              (classification.usage.totalTokens ?? 0) +
              (lint?.usage.totalTokens ?? 0),
          ),
        },
      ]
    : [];

  return (
    <aside className="bg-card text-card-foreground grid items-start gap-5 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Section title="Pipeline">
        <ol className="flex flex-col gap-1.5">
          <Step
            label="Lex"
            detail="in code"
            state={stage === "idle" || stage === "detecting" ? "waiting" : "done"}
          />
          <Step
            label="Classify language"
            detail={detection ? `${detection.modelMs}ms` : "Jev"}
            state={stage === "detecting" ? "running" : detection ? "done" : "waiting"}
          />
          <Step
            label="Classify tokens"
            detail={classification ? `${classification.stats.modelMs}ms` : "Jev"}
            state={stage === "classifying" ? "running" : classification ? "done" : "waiting"}
          />
          <Step
            label="Lint"
            detail={lint ? `${lint.stats.gateMs + lint.stats.lineMs}ms` : "Jev"}
            state={lintPending ? "running" : lint ? "done" : "waiting"}
          />
        </ol>
      </Section>

      {detection && (
        <Section title="Language">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold">{detection.label}</span>
            <span className="text-muted-foreground font-mono text-[0.65rem]">
              confidence {detection.confidence?.toFixed(2) ?? "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {languageBars.map(([id, probability]) => (
              <Bar key={id} label={id} value={probability} />
            ))}
          </div>
          {detection.looksLikeCode < 0.5 && (
            <p className="text-muted-foreground text-[0.7rem]">
              Jev put the odds that this is code at all at{" "}
              {detection.looksLikeCode.toFixed(2)} — the highlighting below is a best effort.
            </p>
          )}
        </Section>
      )}

      {judgement ? (
        <Section title="Token">
          <div className="flex items-baseline justify-between gap-2">
            <code className="font-mono text-sm font-semibold" data-role={judgement.role}>
              {judgement.lexeme}
            </code>
            <span className="text-muted-foreground font-mono text-[0.65rem]">
              {judgement.occurrences}× · confidence {judgement.confidence?.toFixed(2) ?? "—"}
            </span>
          </div>
          <p className="text-muted-foreground font-mono text-[0.65rem]">
            {judgement.before || "^"} <span className="text-foreground">{judgement.lexeme}</span>{" "}
            {judgement.after || "$"}
          </p>
          <div className="flex flex-col gap-1.5">
            {SEMANTIC_ROLES.map((role) => (
              <Bar
                key={role}
                label={ROLE_LABELS[role]}
                value={judgement.probabilities[role] ?? 0}
                tint={ROLE_TINT(role)}
              />
            ))}
          </div>
        </Section>
      ) : (
        classification && (
          <Section title="Roles">
            <ul className="flex flex-col gap-1">
              {SEMANTIC_ROLES.filter((role) => counts.get(role)).map((role) => (
                <li key={role} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: ROLE_TINT(role) }}
                  />
                  <span>{ROLE_LABELS[role]}</span>
                  <span className="text-muted-foreground ml-auto font-mono text-[0.65rem] tabular-nums">
                    {counts.get(role)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-[0.7rem]">
              Click any coloured word in the code to see the distribution Jev returned for it.
            </p>
          </Section>
        )
      )}

      {classification && (
        <Section title="Cost">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground text-[0.7rem]">{stat.label}</dt>
                <dd className="font-mono text-[0.7rem] tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
          {classification.stats.coarse && (
            <p className="text-muted-foreground text-[0.7rem]">
              Too many distinct positions to ask about individually, so repeats were collapsed on
              the word alone and each word got one answer for the whole file.
            </p>
          )}
          {classification.stats.capped && (
            <p className="text-muted-foreground text-[0.7rem]">
              Past the question limit; the remaining words are left uncoloured.
            </p>
          )}
        </Section>
      )}
    </aside>
  );
}
