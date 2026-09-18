import type { Token, TokenKind } from "../highlight/lexer.ts";
import { MAX_LINES, type Severity } from "./types.ts";

/**
 * The rule set, and the mechanical part of applying it.
 *
 * Each rule carries two things: a description of the mistake, which is what
 * Jev is asked about, and a `candidates` predicate, which is pure code and
 * only narrows *where* to ask. A predicate never decides that something is
 * wrong — at most it decides that a line is the sort of place where this rule
 * could conceivably apply, so the file's other eighty lines cost nothing.
 */

/** One line of the file, with what the lexer already knows about it. */
export interface LineInfo {
  /** 1-based. */
  number: number;
  text: string;
  /** Token kinds starting on this line. */
  kinds: Set<TokenKind>;
  /** Number literals on the line, exactly as written. */
  numbers: string[];
  /** Whitespace only. */
  blank: boolean;
  /** Nothing but a comment, so it carries no code for a rule to be about. */
  commentOnly: boolean;
}

export interface Rule {
  id: string;
  /** Short, for the UI. */
  title: string;
  severity: Severity;
  /** What the mistake is. Goes into the shared state once per request. */
  detail: {
    violation: string;
    fine: string;
  };
  /**
   * Lines worth asking about. Omitted means every line that holds code.
   * Cheap and approximate on purpose: a false positive here costs one
   * question, a false negative hides a real finding.
   */
  candidates?: (line: LineInfo) => boolean;
  /** Set only by the rule that is about comments. */
  includeComments?: boolean;
}

const matches = (pattern: RegExp) => (line: LineInfo) => pattern.test(line.text);

/** Values so common that naming them would be noise. */
const OBVIOUS_NUMBERS = new Set(["0", "1", "2", "-1", "100", "0.0", "1.0"]);

export const RULES: Rule[] = [
  {
    id: "silent-failure",
    title: "Error swallowed",
    severity: "error",
    detail: {
      violation:
        "A failure is caught and then thrown away: an empty handler, a bare pass or continue, a log with no re-raise, or a bland default returned in its place, so the real cause never reaches anyone.",
      fine: "A failure that is handled deliberately — re-raised, wrapped with context, reported to the caller, or a documented fallback that the caller can tell apart from success.",
    },
    candidates: matches(
      /\b(catch|except|rescue|recover|finally|err|error|panic|throw|raise|fail|ignore|pass)\b|\.catch\(|\?\?|\|\|/i,
    ),
  },
  {
    id: "hardcoded-secret",
    title: "Secret in source",
    severity: "error",
    detail: {
      violation:
        "A credential written directly into the source: an API key, token, password, connection string, private host name, or signing secret that should have come from configuration or a secret store.",
      fine: "A placeholder, an obviously fake example value, a public identifier, or a name that is read from configuration or an environment variable rather than written out.",
    },
    candidates: (line) =>
      /\b(key|token|secret|password|passwd|pwd|auth|credential|api|bearer|private|dsn|conn)\w*\b/i.test(
        line.text,
      ) || line.kinds.has("string"),
  },
  {
    id: "magic-number",
    title: "Unexplained literal",
    severity: "warning",
    detail: {
      violation:
        "A bare literal used in logic where the number itself carries meaning nobody has written down — a timeout, a limit, a conversion factor, a status code — and a named constant would say what it is.",
      fine: "A value whose meaning is already obvious from the line: an index of 0 or 1, an empty check, a well-known unit, or a literal that is immediately assigned to a name that explains it.",
    },
    candidates: (line) => line.numbers.some((value) => !OBVIOUS_NUMBERS.has(value)),
  },
  {
    id: "unclear-name",
    title: "Name says nothing",
    severity: "warning",
    detail: {
      violation:
        "A name introduced here that does not say what it holds or does: a single letter outside a short loop, tmp, data2, foo, doStuff, or a name that repeats the type instead of the meaning.",
      fine: "A name that tells a reader what the value is for, or a conventional short name whose meaning is unmistakable in context — i in a loop, e for a caught error, id, ok.",
    },
    candidates: matches(
      /\b(let|const|var|val|def|defp|fn|func|function|class|struct|type|interface|enum|public|private|protected|static)\b|:=|=[^=>]/,
    ),
  },
  {
    id: "stale-comment",
    title: "Comment disagrees",
    severity: "warning",
    detail: {
      violation:
        "A comment that no longer matches the code it sits on: it describes different behaviour, names something that is no longer there, promises a case the code does not handle, or contradicts what actually happens.",
      fine: "A comment that matches the code, or that explains why rather than what and so does not restate anything that could drift.",
    },
    // Only lines that actually carry a comment. The lexer already knows which,
    // and this is the one rule for which a comment-only line is the subject.
    includeComments: true,
    candidates: (line) => line.kinds.has("comment"),
  },
  {
    id: "unhandled-async",
    title: "Result never awaited",
    severity: "error",
    detail: {
      violation:
        "A call that returns a promise, future, task, or goroutine result, started here and then never awaited, joined, or otherwise handled, so its failures vanish and its ordering is not guaranteed.",
      fine: "Concurrent work that is awaited, joined, collected, or deliberately detached with its failures handled somewhere the reader can see.",
    },
    candidates: matches(
      /\b(async|await|promise|future|task|defer|spawn|thread|goroutine|then|subscribe|setTimeout|setInterval)\b|\bgo\s+\w|\.then\(/i,
    ),
  },
  {
    id: "unvalidated-input",
    title: "Input not checked",
    severity: "error",
    detail: {
      violation:
        "A value that came from outside the program — a request, a parameter, an environment variable, a file, or parsed text — used here without first being checked for being missing, empty, malformed, or out of range.",
      fine: "An outside value that has already been validated, defaulted, or narrowed by a type the language enforces, or one whose use is harmless if it is wrong.",
    },
    candidates: matches(
      /\b(req|request|input|param|params|arg|argv|env|body|query|headers|cookie|form|payload|stdin|read|parse|json|decode|unmarshal)\b/i,
    ),
  },
  {
    id: "mutated-input",
    title: "Caller's value changed",
    severity: "warning",
    detail: {
      violation:
        "A parameter, argument, or shared collection modified in place here, so a caller that still holds it sees it change underneath them.",
      fine: "A local value being built up, a copy being modified, or a mutation the function's name and contract make explicit.",
    },
    candidates: matches(
      /\.(push|pop|shift|unshift|splice|sort|reverse|append|extend|insert|remove|add|clear|update|set|delete)\(|\bdel\b|\[[^\]]*\]\s*=[^=]/,
    ),
  },
  {
    id: "boundary-risk",
    title: "Off-by-one risk",
    severity: "warning",
    detail: {
      violation:
        "A comparison, index, or range here that is likely wrong at its edge: a bound that should be strict and is not, a slice that drops its first or last element, or an index that can run one past the end.",
      fine: "A boundary that is correct, or one where the language guarantees the range and an off-by-one cannot happen.",
    },
    candidates: matches(/[<>]=?|\[|\b(len|length|size|count|range|slice|substring|index)\b/i),
  },
];

/**
 * Splits the source into lines, carrying across what the lexer found on each.
 * A token that spans lines is attributed to the line it starts on, which is
 * all the candidate predicates need.
 */
export function describeLines(source: string, tokens: Token[]): LineInfo[] {
  const texts = source.split("\n");
  const lines: LineInfo[] = texts.map((text, index) => ({
    number: index + 1,
    text,
    kinds: new Set<TokenKind>(),
    numbers: [],
    blank: text.trim().length === 0,
    commentOnly: false,
  }));

  for (const token of tokens) {
    const line = lines[token.line - 1];
    if (!line) continue;
    line.kinds.add(token.kind);
    if (token.kind === "number") line.numbers.push(token.text);
  }

  for (const line of lines) {
    if (line.blank) continue;
    const kinds = [...line.kinds];
    line.commentOnly =
      kinds.length > 0 && kinds.every((kind) => kind === "comment" || kind === "space");
  }

  return lines;
}

/** Lines that hold code, bounded so a long paste cannot fan out without limit. */
export function codeLines(lines: LineInfo[]): LineInfo[] {
  return lines.slice(0, MAX_LINES).filter((line) => !line.blank && !line.commentOnly);
}

/**
 * Where a rule could apply. Comment-only lines are out for every rule except
 * the one whose subject is the comment itself.
 */
export function candidatesFor(rule: Rule, lines: LineInfo[]): LineInfo[] {
  const pool = lines
    .slice(0, MAX_LINES)
    .filter((line) => !line.blank && (rule.includeComments || !line.commentOnly));
  return rule.candidates ? pool.filter(rule.candidates) : pool;
}
