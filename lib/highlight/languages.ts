/**
 * The languages the demo can lex, and the lexical rules for each.
 *
 * Jev picks the id; this table picks the rules. Comment markers and quoting are
 * facts about a language, not judgments about a file, so once the language is
 * known there is nothing left for a model to decide here.
 */

export interface StringRule {
  open: string;
  close: string;
  /** Whether a backslash escapes the next character. */
  escape?: boolean;
  /** Whether the literal may span lines. Single-line ones stop at a newline. */
  multiline?: boolean;
}

export interface LanguageSpec {
  /** Line-comment openers. The comment runs to the end of the line. */
  line: string[];
  /** Block-comment delimiter pairs. */
  block: Array<[string, string]>;
  /** Tried in order, so longer openers (`"""`) must come before shorter (`"`). */
  strings: StringRule[];
  /** Sticky pattern for one identifier, anchored at the current index. */
  word: RegExp;
}

const DEFAULT_WORD = /[A-Za-z_$][\w$]*/y;

const C_STRINGS: StringRule[] = [
  { open: '"', close: '"', escape: true },
  { open: "'", close: "'", escape: true },
];

const JS_STRINGS: StringRule[] = [
  ...C_STRINGS,
  { open: "`", close: "`", escape: true, multiline: true },
];

const TRIPLE_STRINGS: StringRule[] = [
  { open: '"""', close: '"""', multiline: true },
  { open: "'''", close: "'''", multiline: true },
  ...C_STRINGS,
];

const SLASH_COMMENTS = { line: ["//"], block: [["/*", "*/"]] as Array<[string, string]> };

/** Declaration order, which is also the order the choice criteria are built in. */
export const LANGUAGE_IDS = [
  "typescript",
  "javascript",
  "python",
  "ruby",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "php",
  "shell",
  "sql",
  "html",
  "css",
  "yaml",
  "json",
  "lua",
  "haskell",
  "elixir",
  "other",
] as const;

export type LanguageId = (typeof LANGUAGE_IDS)[number];

interface LanguageMeta {
  label: string;
  /** What marks this language out from the others, for the choice criteria. */
  hint: string;
  spec: LanguageSpec;
}

const LANGUAGES: Record<LanguageId, LanguageMeta> = {
  typescript: {
    label: "TypeScript",
    hint: "JavaScript with type annotations: `interface`, `type`, `: string`, `as`, generics, or `.ts`/`.tsx` idioms. Includes TSX.",
    spec: { ...SLASH_COMMENTS, strings: JS_STRINGS, word: DEFAULT_WORD },
  },
  javascript: {
    label: "JavaScript",
    hint: "`function`, `const`, `=>`, `require`/`import`, and no type annotations anywhere. Includes JSX without types.",
    spec: { ...SLASH_COMMENTS, strings: JS_STRINGS, word: DEFAULT_WORD },
  },
  python: {
    label: "Python",
    hint: "`def`, `class`, `import`, colon-and-indent blocks, `self`, `None`, `#` comments, f-strings.",
    spec: { line: ["#"], block: [], strings: TRIPLE_STRINGS, word: DEFAULT_WORD },
  },
  ruby: {
    label: "Ruby",
    hint: "`def` closed by `end`, `do |x|` blocks, `@ivars`, `:symbols`, `puts`, `nil`, `require`.",
    spec: {
      line: ["#"],
      block: [["=begin", "=end"]],
      strings: C_STRINGS,
      word: /[@$]{0,2}[A-Za-z_]\w*[?!]?/y,
    },
  },
  go: {
    label: "Go",
    hint: "`func`, `package`, `:=`, explicit `err` returns, `nil`, struct tags, backtick raw strings.",
    spec: {
      ...SLASH_COMMENTS,
      strings: [
        { open: '"', close: '"', escape: true },
        { open: "`", close: "`", multiline: true },
        { open: "'", close: "'", escape: true },
      ],
      word: DEFAULT_WORD,
    },
  },
  rust: {
    label: "Rust",
    hint: "`fn`, `let mut`, `impl`, `pub`, `->`, `::` paths, `&`/lifetimes, `match`, `Result`/`Option`, `!` macros.",
    spec: {
      ...SLASH_COMMENTS,
      // A leading quote is folded into the word so `'a` reads as a lifetime
      // rather than opening a string that never closes.
      strings: [{ open: '"', close: '"', escape: true }],
      word: /'?[A-Za-z_]\w*/y,
    },
  },
  java: {
    label: "Java",
    hint: "`public class`, `void`, `new`, `@Override`, `System.out`, packages, semicolons and braces.",
    spec: { ...SLASH_COMMENTS, strings: TRIPLE_STRINGS, word: DEFAULT_WORD },
  },
  kotlin: {
    label: "Kotlin",
    hint: "`fun`, `val`/`var`, `data class`, `?.`, `when`, trailing lambdas, no semicolons.",
    spec: { ...SLASH_COMMENTS, strings: TRIPLE_STRINGS, word: DEFAULT_WORD },
  },
  swift: {
    label: "Swift",
    hint: "`func`, `let`/`var`, `guard`, `struct`, optionals with `?`/`!`, `import Foundation`, `@State`.",
    spec: { ...SLASH_COMMENTS, strings: TRIPLE_STRINGS, word: DEFAULT_WORD },
  },
  c: {
    label: "C",
    hint: "`#include <...>`, `int main`, pointers with `*`, `struct`, `malloc`, and no classes or templates.",
    spec: { ...SLASH_COMMENTS, strings: C_STRINGS, word: DEFAULT_WORD },
  },
  cpp: {
    label: "C++",
    hint: "`#include`, `std::`, `template<`, `class`, `nullptr`, `cout <<`, `namespace`.",
    spec: { ...SLASH_COMMENTS, strings: C_STRINGS, word: DEFAULT_WORD },
  },
  csharp: {
    label: "C#",
    hint: "`using System;`, `namespace`, `public class`, `var`, properties with `{ get; set; }`, `async Task`.",
    spec: { ...SLASH_COMMENTS, strings: TRIPLE_STRINGS, word: DEFAULT_WORD },
  },
  php: {
    label: "PHP",
    hint: "`<?php`, `$variables`, `->`, `function`, `echo`, `use` statements.",
    spec: {
      line: ["//", "#"],
      block: [["/*", "*/"]],
      strings: C_STRINGS,
      word: /\$?[A-Za-z_]\w*/y,
    },
  },
  shell: {
    label: "Shell",
    hint: "A script of commands: `#!/bin/bash`, `$VAR`, pipes, flags like `-rf`, `if ... fi`, backticks or `$(...)`.",
    spec: {
      line: ["#"],
      block: [],
      strings: [
        { open: '"', close: '"', escape: true },
        { open: "'", close: "'" },
      ],
      word: /\$?[A-Za-z_]\w*/y,
    },
  },
  sql: {
    label: "SQL",
    hint: "`SELECT ... FROM ... WHERE`, `JOIN`, `CREATE TABLE`, `INSERT INTO`, `--` comments.",
    spec: {
      line: ["--"],
      block: [["/*", "*/"]],
      strings: [
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
      word: DEFAULT_WORD,
    },
  },
  html: {
    label: "HTML",
    hint: "Angle-bracket markup with `<html>`, `<div>`, attributes, and `<!-- -->` comments. Not a component file with logic.",
    spec: {
      line: [],
      block: [["<!--", "-->"]],
      strings: C_STRINGS,
      word: /[A-Za-z_][\w:.-]*/y,
    },
  },
  css: {
    label: "CSS",
    hint: "Selectors followed by `{ property: value; }`, `@media`, hex colours, units like `px`/`rem`. Includes SCSS.",
    spec: {
      line: ["//"],
      block: [["/*", "*/"]],
      strings: C_STRINGS,
      word: /-{0,2}[A-Za-z_][\w-]*/y,
    },
  },
  yaml: {
    label: "YAML",
    hint: "Indented `key: value` pairs, `-` list items, `#` comments, and no braces or semicolons.",
    spec: {
      line: ["#"],
      block: [],
      strings: C_STRINGS,
      word: /[A-Za-z_][\w.-]*/y,
    },
  },
  json: {
    label: "JSON",
    hint: "One brace- or bracket-rooted data literal: quoted keys, commas, no comments and no code.",
    spec: {
      line: [],
      block: [],
      strings: [{ open: '"', close: '"', escape: true }],
      word: DEFAULT_WORD,
    },
  },
  lua: {
    label: "Lua",
    hint: "`local`, `function ... end`, `then`, `nil`, `--` comments, `..` concatenation.",
    spec: {
      line: ["--"],
      block: [["--[[", "]]"]],
      strings: C_STRINGS,
      word: DEFAULT_WORD,
    },
  },
  haskell: {
    label: "Haskell",
    hint: "`::` type signatures, `->`, `data`/`where`/`let ... in`, `$`, point-free composition.",
    spec: {
      line: ["--"],
      block: [["{-", "-}"]],
      strings: [{ open: '"', close: '"', escape: true }],
      word: /[A-Za-z_][\w']*/y,
    },
  },
  elixir: {
    label: "Elixir",
    hint: "`defmodule`, `def ... do ... end`, `|>`, `:atoms`, `%{}` maps, `@attributes`.",
    spec: {
      line: ["#"],
      block: [],
      strings: TRIPLE_STRINGS,
      word: /[@:]?[A-Za-z_]\w*[?!]?/y,
    },
  },
  other: {
    label: "Other",
    hint: "Source in a language not listed above, or text that is not source code at all.",
    spec: {
      line: ["//", "#", "--"],
      block: [["/*", "*/"]],
      strings: JS_STRINGS,
      word: DEFAULT_WORD,
    },
  },
};

/** The same table in declaration order, for building criteria and legends. */
export const LANGUAGE_LIST = LANGUAGE_IDS.map((id) => ({ id, ...LANGUAGES[id] }));

export function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === "string" && value in LANGUAGES;
}

export function labelOf(id: LanguageId): string {
  return LANGUAGES[id].label;
}

/**
 * Comment styles offered as a fallback. Asked speculatively alongside the
 * language so an unrecognised language still lexes its comments correctly; the
 * answer is ignored whenever the language itself is one this table knows.
 */
export const COMMENT_STYLES = {
  slash: { line: ["//"], block: [["/*", "*/"]] as Array<[string, string]> },
  hash: { line: ["#"], block: [] as Array<[string, string]> },
  dash: { line: ["--"], block: [] as Array<[string, string]> },
  semicolon: { line: [";"], block: [] as Array<[string, string]> },
  percent: { line: ["%"], block: [] as Array<[string, string]> },
  none: { line: [] as string[], block: [] as Array<[string, string]> },
} as const;

export type CommentStyle = keyof typeof COMMENT_STYLES;

export function isCommentStyle(value: unknown): value is CommentStyle {
  return typeof value === "string" && value in COMMENT_STYLES;
}

/**
 * The rules to lex with. A known language brings its own; `other` borrows the
 * comment markers Jev guessed and keeps permissive quoting.
 */
export function specFor(id: LanguageId, commentStyle?: CommentStyle): LanguageSpec {
  const base = LANGUAGES[id].spec;
  if (id !== "other" || !commentStyle) return base;

  const { line, block } = COMMENT_STYLES[commentStyle];
  return { ...base, line: [...line], block: block.map((pair) => [...pair] as [string, string]) };
}
