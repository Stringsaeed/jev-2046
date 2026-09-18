"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { CodeView } from "@/components/highlight/code-view";
import { HighlightPanel } from "@/components/highlight/highlight-panel";
import { LintPanel } from "@/components/highlight/lint-panel";
import { Pane } from "@/components/highlight/pane";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useHighlighter } from "@/hooks/use-highlighter";
import { useMediaQuery } from "@/hooks/use-media-query";
import { JEV_MODEL } from "@/lib/agent/highlight-jev";
import { SAMPLES } from "@/lib/highlight/samples";
import { MAX_SOURCE_CHARS } from "@/lib/highlight/types";
import { cn } from "@/lib/utils";

/**
 * A highlighter and a linter with no grammar and no rule engine behind them.
 *
 * Paste anything. Round one asks Jev one question — which language is this —
 * and the answer picks the lexer's comment and quoting rules. Round two asks
 * one question per identifier: keyword, type, function, property, constant,
 * variable or tag. Nothing in between is a parser.
 *
 * The third panel runs the same trick over a rule set: the rules and the search
 * for where each could apply are code, and whether a given line actually breaks
 * one is a judgment.
 */

/** Below this the three panels stack and stop being draggable. */
const WIDE = "(min-width: 1024px)";

const HANDLE_CLASS =
  "mx-1.5 w-px bg-transparent [&>div]:transition-colors hover:[&>div]:bg-muted-foreground";

export function CodeHighlighter() {
  const [source, setSource] = useState(SAMPLES[0].source);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const highlighter = useHighlighter();
  const wide = useMediaQuery(WIDE);

  const { stage, classification, preview } = highlighter;
  const busy = stage === "detecting" || stage === "classifying";
  const spans = classification?.spans ?? preview;

  const sourcePane = (
    <Pane
      title="Source"
      trailing={
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "text-muted-foreground font-mono text-[0.65rem] tabular-nums",
              source.length > MAX_SOURCE_CHARS && "text-destructive",
            )}
          >
            {source.length}/{MAX_SOURCE_CHARS}
          </span>
          <Button
            size="sm"
            disabled={busy || source.trim().length === 0}
            onClick={() => {
              // The inspector and the active line both point into the previous
              // answer set, so they close here rather than in an effect once
              // the new one lands.
              setSelected(null);
              setActiveLine(null);
              highlighter.run(source);
            }}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {busy ? "Reading" : "Highlight"}
          </Button>
        </div>
      }
    >
      <textarea
        value={source}
        spellCheck={false}
        wrap="off"
        onChange={(event) => setSource(event.target.value)}
        placeholder="Paste code here…"
        className="min-h-0 flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-[0.78rem] leading-[1.7] whitespace-pre outline-none"
      />
    </Pane>
  );

  const outputPane = (
    <Pane
      title={
        classification
          ? classification.label
          : stage === "classifying"
            ? `${highlighter.detection?.label} · asking about every word`
            : "Highlighted"
      }
      trailing={
        highlighter.truncated ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[0.65rem]">
            truncated to {MAX_SOURCE_CHARS}
          </span>
        ) : undefined
      }
    >
      {highlighter.error ? (
        <p className="text-destructive m-4 text-sm">{highlighter.error}</p>
      ) : spans ? (
        <CodeView
          spans={spans}
          confidenceOf={(index) => classification?.judgements[index]?.confidence}
          selected={selected}
          onSelect={setSelected}
          pending={classification === null}
          severityOf={highlighter.severityOf}
          activeLine={activeLine}
        />
      ) : (
        <p className="text-muted-foreground m-4 text-sm">
          Nothing read yet. Press Highlight and the language comes back first, then a colour for
          every word.
        </p>
      )}
    </Pane>
  );

  const lintPane = (
    <LintPanel highlighter={highlighter} activeLine={activeLine} onSelectLine={setActiveLine} />
  );

  return (
    <div className="flex w-full max-w-7xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Highlighter</h1>
          <p className="text-muted-foreground mt-0.5 max-w-prose text-sm">
            Paste code in any language. Code splits it into tokens;{" "}
            <span className="font-mono text-[0.75rem]">{JEV_MODEL}</span> decides what the language
            is, what every word in it means, and which of nine rules it breaks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SAMPLES.map((sample) => (
            <button
              key={sample.name}
              type="button"
              disabled={busy}
              onClick={() => {
                setSource(sample.source);
                setSelected(null);
                setActiveLine(null);
                highlighter.reset();
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-50",
                source === sample.source && "bg-foreground text-background hover:bg-foreground",
              )}
            >
              {sample.name}
            </button>
          ))}
        </div>
      </header>

      {wide ? (
        <ResizablePanelGroup orientation="horizontal" className="h-[34rem]">
          <ResizablePanel defaultSize="34%" minSize="16%">
            {sourcePane}
          </ResizablePanel>
          <ResizableHandle withHandle className={HANDLE_CLASS} />
          <ResizablePanel defaultSize="38%" minSize="18%">
            {outputPane}
          </ResizablePanel>
          <ResizableHandle withHandle className={HANDLE_CLASS} />
          <ResizablePanel defaultSize="28%" minSize="16%">
            {lintPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        // Dragging a 1px divider is not a phone interaction, so below the
        // breakpoint the panels stack at a fixed height instead.
        <div className="flex flex-col gap-4">
          <div className="h-[26rem]">{sourcePane}</div>
          <div className="h-[26rem]">{outputPane}</div>
          <div className="h-[26rem]">{lintPane}</div>
        </div>
      )}

      {(highlighter.detection || busy) && (
        <HighlightPanel highlighter={highlighter} selected={selected} />
      )}
    </div>
  );
}
