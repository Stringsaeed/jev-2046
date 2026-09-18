import { experimental_evaluate as evaluate } from "ai";

// Explicit .ts specifiers, matching the other agents in this repo.
import { lex } from "../highlight/lexer.ts";
import { labelOf, type CommentStyle, type LanguageId } from "../highlight/languages.ts";
import type { Usage } from "../highlight/types.ts";
import {
  RULES,
  candidatesFor,
  codeLines,
  describeLines,
  type LineInfo,
  type Rule,
} from "../lint/rules.ts";
import {
  bySeverityThenLine,
  type Diagnostic,
  type LintResult,
  type RuleGate,
} from "../lint/types.ts";

/**
 * Linting in two passes, cheap one first.
 *
 * Pass one asks the file as a whole: for each rule, one yes/no — does this file
 * break it anywhere? Nine questions, one request, and a clean file stops here
 * having never been read line by line.
 *
 * Pass two only runs for the rules that got past that gate, and only over the
 * lines code says the rule could apply to. Each of those is again one yes/no.
 * Code never decides that something is wrong and the model never decides where
 * to look; the diagnostics fall out of the two answers meeting.
 */

export const JEV_MODEL = "typesafe-ai/jev";

/**
 * A rule below this is not searched for line by line. Deliberately generous:
 * the gate is a cost filter, not the verdict, and a rule the file only half
 * suggests is exactly the one worth reading line by line. The line pass, at
 * `REPORT_THRESHOLD`, is what actually decides.
 */
const GATE_THRESHOLD = 0.35;

/** A line below this is not reported, however sure the gate was. */
const REPORT_THRESHOLD = 0.5;

/** Line questions per request. Noul criteria are short, so these pack tighter. */
const BATCH_SIZE = 60;

/** Hard ceiling on the line pass, so a bad gate cannot fan out without limit. */
const MAX_LINE_QUESTIONS = 240;

/** Lines are quoted in their own question, so they get trimmed first. */
const MAX_LINE_CHARS = 200;

const VERDICT_CRITERIA = {
  true: "This line really is an instance of that mistake.",
  false: "It is not, or the rule simply does not apply to this line.",
} as const;

/** The file as numbered lines. Both passes read positions, so both need these. */
function numbered(lines: LineInfo[]): string[] {
  return lines.map((line) => `${line.number}| ${line.text.slice(0, MAX_LINE_CHARS)}`);
}

/** Rule descriptions for the shared state, sent once however many questions follow. */
function guideFor(rules: Rule[]) {
  const guide: Record<string, { title: string; violation: string; fine: string }> = {};
  for (const rule of rules) {
    guide[rule.id] = {
      title: rule.title,
      violation: rule.detail.violation,
      fine: rule.detail.fine,
    };
  }
  return guide;
}

function addUsage(total: Usage, next: Usage): Usage {
  return {
    inputTokens: (total.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (total.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (total.totalTokens ?? 0) + (next.totalTokens ?? 0),
  };
}

const zeroDataRetention =
  process.env.JEV_ZERO_DATA_RETENTION === "1"
    ? { providerOptions: { gateway: { zeroDataRetention: true } } }
    : {};

/**
 * Both passes, in order. Returns every rule with the verdict it got, so a rule
 * the gate rejected is still visible as a rule that was considered and cleared.
 */
export async function lintSource(
  source: string,
  language: LanguageId,
  commentStyle?: CommentStyle,
): Promise<LintResult> {
  const label = labelOf(language);
  const lines = describeLines(source, lex(source, language, commentStyle));
  const code = codeLines(lines);
  const lineText = numbered(lines);

  // ---- Pass one: one question per rule, about the whole file. ----------------
  const gateStartedAt = performance.now();
  const gateQuestions: Record<string, ReturnType<typeof gateQuestionFor>> = {};
  for (const rule of RULES) gateQuestions[rule.id] = gateQuestionFor(rule, label);

  const gate = await evaluate({
    model: JEV_MODEL,
    state: {
      task: `Review this ${label} file against a fixed set of rules. Each question asks whether the file breaks one of them anywhere.`,
      language: label,
      lines: lineText,
      rules: guideFor(RULES),
      hints: [
        "Each line is prefixed with its number and a pipe, which are not part of the code.",
        "Answer about this file as it stands, not about what the rule warns against in general.",
        "A rule that has no opportunity to be broken here — because the file does nothing of that kind — is not broken.",
      ],
    },
    ...zeroDataRetention,
    questions: gateQuestions,
  });
  const gateMs = Math.round(performance.now() - gateStartedAt);

  let usage: Usage = gate.usage;

  // ---- What pass two will look at. -----------------------------------------
  const searches: Array<{ rule: Rule; probability: number; candidates: LineInfo[] }> = [];
  const rules: RuleGate[] = [];
  let budget = MAX_LINE_QUESTIONS;
  let capped = false;

  for (const rule of RULES) {
    const probability = gate.answers[rule.id].probability;
    const open = probability >= GATE_THRESHOLD;
    const found = open ? candidatesFor(rule, lines) : [];
    // Most likely rules take the budget first, but the loop is in rule order,
    // so a long file simply stops offering lines once the budget is gone.
    const taken = found.slice(0, Math.max(budget, 0));
    if (taken.length < found.length) capped = true;
    budget -= taken.length;

    if (taken.length > 0) searches.push({ rule, probability, candidates: taken });
    rules.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      probability,
      candidates: taken.length,
      searched: open,
    });
  }

  // ---- Pass two: one question per rule per candidate line. ------------------
  const asked: Array<{ rule: Rule; line: LineInfo }> = [];
  for (const search of searches) {
    for (const line of search.candidates) asked.push({ rule: search.rule, line });
  }

  const batches: Array<typeof asked> = [];
  for (let i = 0; i < asked.length; i += BATCH_SIZE) batches.push(asked.slice(i, i + BATCH_SIZE));

  const openRules = searches.map((search) => search.rule);
  const lineStartedAt = performance.now();
  const results = await Promise.all(
    batches.map((batch, batchIndex) => {
      const questions: Record<string, ReturnType<typeof lineQuestionFor>> = {};
      batch.forEach(({ rule, line }, offset) => {
        questions[`l${batchIndex}_${offset}`] = lineQuestionFor(rule, line, label);
      });

      return evaluate({
        model: JEV_MODEL,
        state: {
          task: `Check individual lines of this ${label} file against the rules they were flagged for.`,
          language: label,
          lines: lineText,
          rules: guideFor(openRules),
          hints: [
            "Each line is prefixed with its number and a pipe, which are not part of the code.",
            "Judge the named line together with the lines around it: the mistake a rule describes often spans two or three lines, and the line named is where it is anchored.",
            "A line that merely mentions the subject of a rule does not break it.",
          ],
        },
        ...zeroDataRetention,
        questions,
      });
    }),
  );
  const lineMs = batches.length === 0 ? 0 : Math.round(performance.now() - lineStartedAt);

  const diagnostics: Diagnostic[] = [];
  results.forEach((result, batchIndex) => {
    usage = addUsage(usage, result.usage);
    batches[batchIndex].forEach(({ rule, line }, offset) => {
      const probability = result.answers[`l${batchIndex}_${offset}`].probability;
      if (probability < REPORT_THRESHOLD) return;
      diagnostics.push({
        rule: rule.id,
        title: rule.title,
        severity: rule.severity,
        line: line.number,
        text: line.text.trim().slice(0, MAX_LINE_CHARS),
        probability,
      });
    });
  });

  return {
    rules,
    diagnostics: diagnostics.sort(bySeverityThenLine),
    stats: {
      codeLines: code.length,
      gateQuestions: RULES.length,
      lineQuestions: asked.length,
      requests: 1 + batches.length,
      gateMs,
      lineMs,
      capped,
    },
    usage,
  };
}

function gateQuestionFor(rule: Rule, label: string) {
  return {
    type: "boolean" as const,
    instructions: `Does this ${label} file contain at least one place that breaks the rule \`rules.${rule.id}\` ("${rule.title}")?`,
    criteria: {
      true: `Somewhere in the file there is a real instance of it: ${rule.detail.violation}`,
      false: `There is no instance of it, or every case that looks like one is fine: ${rule.detail.fine}`,
    },
  };
}

function lineQuestionFor(rule: Rule, line: LineInfo, label: string) {
  // Short on purpose: this text is repeated for every line the rule is checked
  // against, so the rule's full description stays in the shared state instead.
  return {
    type: "boolean" as const,
    instructions: `In this ${label} file, does line ${line.number} break the rule \`rules.${rule.id}\` ("${rule.title}")? Line ${line.number}: ${line.text.trim().slice(0, MAX_LINE_CHARS)}`,
    criteria: VERDICT_CRITERIA,
  };
}
