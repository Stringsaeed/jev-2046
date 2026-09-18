import { analyseAffinity, type GuessFeedback } from "@/lib/agent/connections-jev";

/** Keeps AI_GATEWAY_API_KEY server-side: the browser sends words, gets groups. */

const MAX_WORDS = 24;
const WORD_PATTERN = /^[A-Za-z0-9 '’\-]{1,24}$/;

function parseWords(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < 4 || value.length > MAX_WORDS) return null;
  if (value.length % 4 !== 0) return null;

  const words: string[] = [];
  for (const word of value) {
    if (typeof word !== "string" || !WORD_PATTERN.test(word)) return null;
    words.push(word);
  }
  return new Set(words).size === words.length ? words : null;
}

/** Prior verdicts, if the caller has any. Malformed entries are dropped. */
function parseFeedback(value: unknown, words: string[]): GuessFeedback[] {
  if (!Array.isArray(value)) return [];
  const out: GuessFeedback[] = [];
  for (const entry of value.slice(0, 16)) {
    const guess = entry as Record<string, unknown> | null;
    if (!guess || (guess.kind !== "one-away" && guess.kind !== "wrong")) continue;
    if (!Array.isArray(guess.words)) continue;
    const picked = guess.words.filter(
      (word): word is string => typeof word === "string" && words.includes(word),
    );
    if (picked.length !== guess.words.length || picked.length === 0) continue;
    out.push({ words: picked, kind: guess.kind });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      { error: "AI_GATEWAY_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const words = parseWords((body as Record<string, unknown> | null)?.words);
  if (!words) {
    return Response.json(
      { error: "`words` must be 4-24 distinct short words, a multiple of four." },
      { status: 400 },
    );
  }

  try {
    const feedback = parseFeedback((body as Record<string, unknown>).feedback, words);
    return Response.json(await analyseAffinity(words, { feedback }));
  } catch (error) {
    console.error("[agent/connections] evaluation failed:", error);
    return Response.json({ error: "The model call failed." }, { status: 502 });
  }
}
