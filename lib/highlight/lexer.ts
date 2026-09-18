import { specFor, type CommentStyle, type LanguageId, type LanguageSpec } from "./languages.ts";
import type { HighlightSpan } from "./types.ts";

export type TokenKind = "word" | "number" | "string" | "comment" | "punctuation" | "space";

export interface Token {
  kind: TokenKind;
  text: string;
  /** 1-based line the token starts on. */
  line: number;
}

/** Digits, radix prefixes, separators, exponents, and a short unit suffix (`px`, `f`, `u8`). */
const NUMBER = /0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?[A-Za-z_]{0,3}/y;

const WHITESPACE = /\s+/y;

/** Scans a delimited run, stopping at the closer, at a newline, or at the end. */
function scanDelimited(
  source: string,
  start: number,
  open: string,
  close: string,
  { escape = false, multiline = true }: { escape?: boolean; multiline?: boolean },
): number {
  let i = start + open.length;
  while (i < source.length) {
    if (escape && source[i] === "\\") {
      i += 2;
      continue;
    }
    // An unterminated single-line literal ends at the newline rather than
    // swallowing the rest of the file, which a stray apostrophe would do.
    if (!multiline && source[i] === "\n") return i;
    if (source.startsWith(close, i)) return i + close.length;
    i += 1;
  }
  return source.length;
}

/**
 * Splits source into tokens using only the rules of the given language. No
 * grammar and no keyword list: a word is any run of identifier characters, and
 * what that word *is* stays undecided here.
 */
export function lex(source: string, language: LanguageId, commentStyle?: CommentStyle): Token[] {
  const spec: LanguageSpec = specFor(language, commentStyle);
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  const push = (kind: TokenKind, text: string) => {
    tokens.push({ kind, text, line });
    for (let c = 0; c < text.length; c += 1) if (text[c] === "\n") line += 1;
    i += text.length;
  };

  while (i < source.length) {
    WHITESPACE.lastIndex = i;
    const space = WHITESPACE.exec(source);
    if (space) {
      push("space", space[0]);
      continue;
    }

    const block = spec.block.find(([open]) => source.startsWith(open, i));
    if (block) {
      push("comment", source.slice(i, scanDelimited(source, i, block[0], block[1], {})));
      continue;
    }

    const lineComment = spec.line.find((open) => source.startsWith(open, i));
    if (lineComment) {
      const end = source.indexOf("\n", i);
      push("comment", source.slice(i, end === -1 ? source.length : end));
      continue;
    }

    const quoted = spec.strings.find((rule) => source.startsWith(rule.open, i));
    if (quoted) {
      const end = scanDelimited(source, i, quoted.open, quoted.close, {
        escape: quoted.escape,
        multiline: quoted.multiline ?? false,
      });
      push("string", source.slice(i, end));
      continue;
    }

    // Words before numbers: an identifier may start with a letter a number
    // never can, so this ordering costs nothing and keeps `0x1f` intact.
    spec.word.lastIndex = i;
    const word = spec.word.exec(source);
    if (word) {
      push("word", word[0]);
      continue;
    }

    NUMBER.lastIndex = i;
    const number = NUMBER.exec(source);
    if (number) {
      push("number", number[0]);
      continue;
    }

    push("punctuation", source[i]);
  }

  return tokens;
}

/** A word token together with the neighbours that give it its meaning. */
export interface WordContext {
  /** Index into the token array this came from. */
  index: number;
  lexeme: string;
  /** Nearest preceding token that is not whitespace or a comment. "" at the start. */
  before: string;
  after: string;
  line: number;
  lineText: string;
  /**
   * Same word, same neighbours, same answer. Collapsing on this is what keeps a
   * few hundred tokens down to a few dozen questions.
   */
  key: string;
}

export const contextKey = (lexeme: string, before: string, after: string) =>
  JSON.stringify([lexeme, before, after]);

function significant(token: Token): boolean {
  return token.kind !== "space" && token.kind !== "comment";
}

/** Every word token in the stream, with the context each one will be judged in. */
export function wordContexts(tokens: Token[], source: string): WordContext[] {
  const lines = source.split("\n");
  const contexts: WordContext[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "word") continue;

    let before = "";
    for (let j = index - 1; j >= 0; j -= 1) {
      if (significant(tokens[j])) {
        before = tokens[j].text;
        break;
      }
    }

    let after = "";
    for (let j = index + 1; j < tokens.length; j += 1) {
      if (significant(tokens[j])) {
        after = tokens[j].text;
        break;
      }
    }

    contexts.push({
      index,
      lexeme: token.text,
      before,
      after,
      line: token.line,
      lineText: lines[token.line - 1] ?? "",
      key: contextKey(token.text, before, after),
    });
  }

  return contexts;
}

/**
 * What the lexer alone can colour, before any model call: comments, strings,
 * numbers and punctuation are already final here. Word tokens are rendered
 * plain until Jev says what they are.
 */
export function lexicalSpans(tokens: Token[]): HighlightSpan[] {
  return tokens.map((token) => ({
    text: token.text,
    role: token.kind === "space" ? "plain" : token.kind === "word" ? "other" : token.kind,
  }));
}
