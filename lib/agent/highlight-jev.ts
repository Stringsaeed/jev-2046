import { experimental_evaluate as evaluate } from "ai";

// Explicit .ts specifiers, matching the other agents in this repo: these
// modules are imported both by Next.js and by plain `node`, and Node's native
// type stripping does not guess extensions.
import { contextKey, lex, wordContexts, type WordContext } from "../highlight/lexer.ts";
import {
  LANGUAGE_LIST,
  isCommentStyle,
  isLanguageId,
  labelOf,
  type CommentStyle,
  type LanguageId,
} from "../highlight/languages.ts";
import {
  MAX_SOURCE_CHARS,
  isSemanticRole,
  type HighlightSpan,
  type SemanticRole,
  type TokenJudgement,
  type Usage,
} from "../highlight/types.ts";

/**
 * A syntax highlighter with no grammar in it.
 *
 * tree-sitter needs a hand-written parser per language. This asks Jev two
 * rounds of typed questions instead:
 *
 *   1. one choice over the languages, plus a speculative comment-style choice
 *      used only if the language turns out to be one the lexer does not know;
 *   2. one choice per distinct identifier-in-context — keyword, type, function,
 *      property, constant, variable, tag — all in the same request.
 *
 * Between the two rounds the work is pure code: the lexer settles comments,
 * strings, numbers and punctuation, which are lexical facts, and hands Jev only
 * the words, whose meaning is the part a regular expression cannot reach.
 */

export const JEV_MODEL = "typesafe-ai/jev";

export { MAX_SOURCE_CHARS };

/**
 * Questions per request. Criteria are repeated per question by the API, so this
 * is what actually bounds a request: too many and the whole call is rejected
 * for length before a single token is judged.
 */
const BATCH_SIZE = 40;

/** Beyond this the source is too big to judge token by token in one go. */
const MAX_QUESTIONS = 400;

/** Long lines are quoted in the question, so they get trimmed first. */
const MAX_LINE_CHARS = 160;

const COMMENT_STYLE_CRITERIA = {
  slash: "Comments start with `//`, and block comments are wrapped in `/* ... */`.",
  hash: "Comments start with `#` and run to the end of the line.",
  dash: "Comments start with `--` and run to the end of the line.",
  semicolon: "Comments start with `;` and run to the end of the line.",
  percent: "Comments start with `%` and run to the end of the line.",
  none: "The text has no comments, or its comment marker is none of the above.",
} as const;

/**
 * The option names every token question offers, with one line each.
 *
 * Short on purpose. Criteria travel with every question, so the contrasts and
 * examples that make these options separable live in `ROLE_GUIDE` instead,
 * which is part of the shared state and is sent once per request.
 */
const ROLE_CRITERIA = {
  keyword:
    "A word the language itself reserves, or a word-shaped operator. See `roles.keyword`.",
  type: "The name of a type, class, interface, struct, enum, trait, or generic parameter. See `roles.type`.",
  function:
    "The name of a function, method, or macro, where it is defined or where it is called. See `roles.function`.",
  property:
    "A field, key, or attribute belonging to something else and not being called. See `roles.property`.",
  constant:
    "A literal value word, an enum member, a symbol, or a name written as a constant. See `roles.constant`.",
  variable:
    "A variable, parameter, binding, or an imported module used as a value. See `roles.variable`.",
  tag: "The element name of a markup tag. See `roles.tag`.",
  other: "None of the above. See `roles.other`.",
} as const;

/**
 * The same eight roles, in full. This goes in the shared state, so the model
 * reads the contrasts once however many questions the request carries.
 */
const ROLE_GUIDE = {
  keyword: {
    covers:
      "Declaration, control-flow, visibility and modifier words, and word-shaped operators. In SQL, the clause words.",
    excludes:
      "A name the author chose and could rename. Literal values such as true, false, null, nil and None, which are constants. Built-in type names such as int or string, which are types.",
    examples:
      "function, def, class, struct, impl, fn, return, if, for, match, import, export, async, await, pub, end, and, not, in, is, new, typeof, SELECT, FROM, WHERE.",
  },
  type: {
    covers:
      "A type name anywhere it is used: a declaration, an annotation, a cast, an inheritance list, or a constructor being called. Built-in type names count.",
    excludes: "A plain value of that type. A function that does not construct the type.",
    examples:
      "User in `class User`, string in `name: string`, HashMap in `HashMap::new()`, Promise in `Promise<void>`, T in `<T>`.",
  },
  function: {
    covers:
      "A function, method, procedure, or macro name, defined or called. A name after a dot that is then called belongs here, not to property.",
    excludes:
      "A constructor call named after the type, which is a type. A field read but never called, which is a property.",
    examples:
      "handleClick in `function handleClick()`, map in `items.map(f)`, print in `print(x)`, main in `func main()`.",
  },
  property: {
    covers:
      "A field, attribute, member, or key that belongs to something else and is not called: reached through a dot or arrow, a key in an object or record literal, a YAML or JSON key, a CSS property name, an attribute name inside a markup tag.",
    excludes: "A method that is called. A standalone name attached to nothing.",
    examples:
      "length in `arr.length`, name in `{ name: 'x' }`, color in `color: red;`, href in `<a href=...>`.",
  },
  constant: {
    covers:
      "A literal value written as a word, an enum member, a symbol or atom, or a name declared as a fixed value and written in SCREAMING_SNAKE_CASE.",
    excludes:
      "An ordinary variable that merely happens to be declared with const, let or val; unless its name is written as a constant, it is a variable.",
    examples: "true, false, null, nil, None, undefined, MAX_RETRIES, Color.RED, :ok, @rate.",
  },
  variable: {
    covers:
      "A variable, parameter, binding, loop index, or an imported module or namespace used as a value. Anything holding a value that is not a member of something else.",
    excludes: "Something reached through a dot. A type name. A word the language reserves.",
    examples: "count in `let count = 0`, items in `for x of items`, self, this, req, $name in PHP.",
  },
  tag: {
    covers:
      "The element name immediately after `<` or `</` in HTML, XML, or JSX, including a capitalised component name.",
    excludes: "Attribute names inside the tag, which are properties. Anything outside the brackets.",
    examples: "div in `<div>`, span in `</span>`, Button in `<Button onClick={...} />`.",
  },
  other: {
    covers: "Prose inside markup or a document, a label, part of a path or URL, a unit, or plain text that is not code.",
    excludes: "Anything that fits one of the roles above.",
    examples: "Words in the body text of an HTML page.",
  },
} as const;

export interface LanguageDetection {
  language: LanguageId;
  label: string;
  /** Distribution over every offered language, so the runners-up stay visible. */
  probabilities: Record<string, number>;
  confidence: number | undefined;
  /** Answered speculatively; used only when `language` is "other". */
  commentStyle: CommentStyle;
  /** P(this is source code at all), as a probability rather than a verdict. */
  looksLikeCode: number;
  modelMs: number;
  usage: Usage;
}

export interface TokenClassification {
  language: LanguageId;
  label: string;
  spans: HighlightSpan[];
  judgements: TokenJudgement[];
  stats: {
    /** Tokens the lexer produced, ignoring whitespace. */
    tokens: number;
    /** Of those, the ones that are words and therefore need a judgment. */
    words: number;
    /** Questions actually asked, after collapsing repeats. */
    questions: number;
    requests: number;
    /** True when repeats were collapsed on the word alone, losing context. */
    coarse: boolean;
    /** True when the source had more distinct contexts than could be asked. */
    capped: boolean;
    modelMs: number;
  };
  usage: Usage;
}

function confidenceFrom(metadata: unknown, id: string): number | undefined {
  const typesafe = (metadata as { typesafe?: { confidence?: Record<string, number> } } | undefined)
    ?.typesafe;
  return typesafe?.confidence?.[id];
}

function addUsage(total: Usage, next: Usage): Usage {
  return {
    inputTokens: (total.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (total.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (total.totalTokens ?? 0) + (next.totalTokens ?? 0),
  };
}

/** Round one. One request, three questions, all about the file as a whole. */
export async function detectLanguage(source: string): Promise<LanguageDetection> {
  const languageCriteria: Record<string, string> = {};
  for (const language of LANGUAGE_LIST) {
    languageCriteria[language.id] = `${language.label}. ${language.hint}`;
  }

  const startedAt = performance.now();
  const result = await evaluate({
    model: JEV_MODEL,
    state: {
      task: "Identify what this pasted text is written in.",
      source,
      lineCount: source.split("\n").length,
      characterCount: source.length,
    },
    // Jev supports Zero Data Retention, but the gateway rejects the flag on
    // Hobby plans (403 ZdrUnauthorizedError), so it is opt-in rather than on.
    ...(process.env.JEV_ZERO_DATA_RETENTION === "1"
      ? { providerOptions: { gateway: { zeroDataRetention: true } } }
      : {}),
    questions: {
      language: {
        type: "choice",
        instructions:
          "Which programming, markup, query, or configuration language is `source` written in? Judge the whole snippet, not one line of it. A fragment that could be several languages should go to the one whose syntax it matches exactly.",
        criteria: languageCriteria,
      },
      // Speculative: only read when `language` comes back as "other", where the
      // lexer has no comment markers of its own. Asking it here costs one extra
      // question rather than a second round trip.
      commentStyle: {
        type: "choice",
        instructions:
          "Supposing `source` is in a language not covered by the list, how are its comments written? Answer from the syntax of the language it is in, not from whether this particular snippet happens to contain a comment.",
        criteria: COMMENT_STYLE_CRITERIA,
      },
      looksLikeCode: {
        type: "boolean",
        instructions: "Is `source` source code, markup, a query, or structured configuration?",
        criteria: {
          true: "It is written for a machine to parse: code, markup, a query, or a structured configuration or data format.",
          false:
            "It is prose, a chat message, a list, or other writing meant only for a person to read.",
        },
      },
    },
  });
  const modelMs = Math.round(performance.now() - startedAt);

  const answer = result.answers.language;
  const language = isLanguageId(answer.choice) ? answer.choice : "other";
  const style = result.answers.commentStyle.choice;

  return {
    language,
    label: labelOf(language),
    probabilities: { ...answer.probabilities },
    confidence: confidenceFrom(result.providerMetadata, "language"),
    commentStyle: isCommentStyle(style) ? style : "slash",
    looksLikeCode: result.answers.looksLikeCode.probability,
    modelMs,
    usage: result.usage,
  };
}

/**
 * Groups the word tokens into the questions that will actually be asked.
 *
 * The same word in the same syntactic position always gets the same answer, so
 * one question covers every occurrence. If a file still has too many distinct
 * positions, the grouping drops to the word alone — coarser, but bounded.
 */
function planQuestions(contexts: WordContext[]): {
  groups: WordContext[][];
  coarse: boolean;
  capped: boolean;
} {
  const group = (keyOf: (context: WordContext) => string) => {
    const byKey = new Map<string, WordContext[]>();
    for (const context of contexts) {
      const key = keyOf(context);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(context);
      else byKey.set(key, [context]);
    }
    return [...byKey.values()];
  };

  let groups = group((context) => context.key);
  let coarse = false;

  if (groups.length > MAX_QUESTIONS) {
    groups = group((context) => contextKey(context.lexeme, "", ""));
    coarse = true;
  }

  const capped = groups.length > MAX_QUESTIONS;
  return { groups: capped ? groups.slice(0, MAX_QUESTIONS) : groups, coarse, capped };
}

function questionFor(context: WordContext, label: string, coarse: boolean) {
  const line = context.lineText.trim().slice(0, MAX_LINE_CHARS);

  // A string rather than an object: this text is repeated once per question, so
  // every word of it is paid for as many times as there are tokens to judge.
  const where = coarse
    ? `It is used throughout the file; judge the role it plays overall.`
    : `Line ${context.line}: ${line} — immediately before it is \`${context.before || "start of file"}\`, immediately after it is \`${context.after || "end of file"}\`.`;

  return {
    type: "choice" as const,
    instructions: `How should the ${label} identifier \`${context.lexeme}\` be syntax-highlighted? ${where}`,
    criteria: ROLE_CRITERIA,
  };
}

/** Round two. Every token question in flight at once, over one copy of the source. */
export async function classifyTokens(
  source: string,
  language: LanguageId,
  commentStyle?: CommentStyle,
): Promise<TokenClassification> {
  const label = labelOf(language);
  const tokens = lex(source, language, commentStyle);
  const contexts = wordContexts(tokens, source);
  const { groups, coarse, capped } = planQuestions(contexts);

  const state = {
    task: `Syntax-highlight this ${label} source. Each question names one identifier in it and asks what that identifier is.`,
    language: label,
    source,
    roles: ROLE_GUIDE,
    hints: [
      "The tokens immediately before and after an identifier are the strongest evidence: a name followed by `(` is being called, a name after `.` belongs to something else, a name after a declaration word is being introduced.",
      "Comments, string literals, numbers and punctuation are already classified and are never asked about. Every question is about one word-shaped token.",
      "The same word can have different roles in different places, which is why each question gives the position.",
    ],
  };

  const batches: WordContext[][][] = [];
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    batches.push(groups.slice(i, i + BATCH_SIZE));
  }

  const startedAt = performance.now();
  const results = await Promise.all(
    batches.map((batch, batchIndex) => {
      const questions: Record<string, ReturnType<typeof questionFor>> = {};
      batch.forEach((occurrences, offset) => {
        questions[`t${batchIndex}_${offset}`] = questionFor(occurrences[0], label, coarse);
      });

      return evaluate({
        model: JEV_MODEL,
        state,
        ...(process.env.JEV_ZERO_DATA_RETENTION === "1"
          ? { providerOptions: { gateway: { zeroDataRetention: true } } }
          : {}),
        questions,
      });
    }),
  );
  const modelMs = Math.round(performance.now() - startedAt);

  const judgements: TokenJudgement[] = [];
  // Token index to judgement index. Built from the grouping rather than from the
  // question key, so the coarse fallback maps just as exactly.
  const judgementOf = new Map<number, number>();
  let usage: Usage = {};

  results.forEach((result, batchIndex) => {
    usage = addUsage(usage, result.usage);

    batches[batchIndex].forEach((occurrences, offset) => {
      const id = `t${batchIndex}_${offset}`;
      const answer = result.answers[id];
      // Typed output guarantees the option is one that was offered, not that it
      // is one this renderer knows how to colour.
      const role: SemanticRole = isSemanticRole(answer.choice) ? answer.choice : "other";

      const index = judgements.length;
      judgements.push({
        lexeme: occurrences[0].lexeme,
        before: occurrences[0].before,
        after: occurrences[0].after,
        role,
        probabilities: { ...answer.probabilities },
        confidence: confidenceFrom(result.providerMetadata, id),
        occurrences: occurrences.length,
      });

      for (const occurrence of occurrences) judgementOf.set(occurrence.index, index);
    });
  });

  const spans: HighlightSpan[] = tokens.map((token, index) => {
    if (token.kind === "space") return { text: token.text, role: "plain" };
    if (token.kind !== "word") return { text: token.text, role: token.kind };

    const judgement = judgementOf.get(index);
    // A word left over past the question cap keeps the neutral default.
    if (judgement === undefined) return { text: token.text, role: "other" };
    return { text: token.text, role: judgements[judgement].role, judgement };
  });

  return {
    language,
    label,
    spans,
    judgements,
    stats: {
      tokens: tokens.filter((token) => token.kind !== "space").length,
      words: contexts.length,
      questions: groups.length,
      requests: batches.length,
      coarse,
      capped,
      modelMs,
    },
    usage,
  };
}
