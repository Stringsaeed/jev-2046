/**
 * A highlighter split down the middle.
 *
 * Everything a regular expression can settle — where a string starts, where a
 * comment ends, which runs of characters are one word — is settled in code by
 * `lexer.ts`. Everything that needs to know what the code *means* — is `User` a
 * type or a variable, is `filter` a method call or a field — is a judgment, and
 * that half goes to Jev.
 *
 * That is the same division tree-sitter makes, except the grammar that would
 * normally have to be written per language is replaced by one classification
 * question asked per token.
 */

/** Pasting a whole repository is not the demo. Longer input is truncated. */
export const MAX_SOURCE_CHARS = 6000;

/** Roles the lexer assigns on its own, with no model involved. */
export const LEXICAL_ROLES = ["comment", "string", "number", "punctuation", "plain"] as const;

/** Roles only Jev assigns. One of these per word token. */
export const SEMANTIC_ROLES = [
  "keyword",
  "type",
  "function",
  "property",
  "constant",
  "variable",
  "tag",
  "other",
] as const;

export type LexicalRole = (typeof LEXICAL_ROLES)[number];
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];
export type Role = LexicalRole | SemanticRole;

export const ROLE_LABELS: Record<Role, string> = {
  keyword: "Keyword",
  type: "Type",
  function: "Function",
  property: "Property",
  constant: "Constant",
  variable: "Variable",
  tag: "Tag",
  other: "Other",
  comment: "Comment",
  string: "String",
  number: "Number",
  punctuation: "Punctuation",
  plain: "Whitespace",
};

export function isSemanticRole(value: string): value is SemanticRole {
  return (SEMANTIC_ROLES as readonly string[]).includes(value);
}

/** One rendered run of source text. */
export interface HighlightSpan {
  text: string;
  role: Role;
  /**
   * Index into `HighlightResult.judgements` when Jev decided this span's role,
   * and undefined when the lexer did. Spans share a judgement whenever they are
   * the same word in the same syntactic position, which is why it is an index
   * and not an inline copy.
   */
  judgement?: number;
}

/** One question Jev answered, reused by every span that matched its context. */
export interface TokenJudgement {
  lexeme: string;
  /** Nearest non-whitespace token before/after, which is the context asked about. */
  before: string;
  after: string;
  role: SemanticRole;
  probabilities: Record<string, number>;
  /** How concentrated the distribution is, per TypeSafe. Undefined if absent. */
  confidence: number | undefined;
  /** How many tokens in the source this one judgement covers. */
  occurrences: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
