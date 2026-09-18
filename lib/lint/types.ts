/**
 * A linter split the same way the highlighter is.
 *
 * The rules are written in code, and so is every mechanical decision about
 * *where* a rule could possibly apply. What none of that can decide — whether
 * this particular line is actually the mistake the rule describes — is the
 * judgment, and that half goes to Jev.
 *
 * The rules here are deliberately the kind no regular expression can settle: a
 * swallowed error, a name that does not say what it holds, a comment that no
 * longer matches its code. A grep can find the candidates; only a reader can
 * say which candidates are real.
 */

export const SEVERITIES = ["error", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Lines past this are not offered to the line-by-line pass. */
export const MAX_LINES = 160;

/** One rule, with the whole-file verdict it got. */
export interface RuleGate {
  id: string;
  title: string;
  severity: Severity;
  /** P(the file breaks this rule somewhere), from the whole-file pass. */
  probability: number;
  /** Lines code offered for the line pass. Zero when the gate stayed shut. */
  candidates: number;
  /** False when the gate closed and no line was ever asked about. */
  searched: boolean;
}

/** One place the line pass agreed with the gate. */
export interface Diagnostic {
  rule: string;
  title: string;
  severity: Severity;
  /** 1-based, matching the gutter in the code view. */
  line: number;
  text: string;
  probability: number;
}

export interface LintResult {
  rules: RuleGate[];
  /** Most severe first, then by line. */
  diagnostics: Diagnostic[];
  stats: {
    /** Lines that hold code, ignoring blanks and comment-only lines. */
    codeLines: number;
    /** One per rule: the whole-file pass. */
    gateQuestions: number;
    /** Rule times candidate line, for the rules that got past the gate. */
    lineQuestions: number;
    requests: number;
    gateMs: number;
    lineMs: number;
    /** True when the line questions hit their cap and some were dropped. */
    capped: boolean;
  };
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Note",
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function bySeverityThenLine(a: Diagnostic, b: Diagnostic): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line;
}
