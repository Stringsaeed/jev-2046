import { detectLanguage } from "@/lib/agent/highlight-jev";

import { missingKey, parseSource, readBody } from "../../request";

/**
 * Round one of the highlighter: what language is this?
 *
 * It exists so AI_GATEWAY_API_KEY stays on the server — the browser sends text
 * and gets back a language, never a key.
 */
export async function POST(request: Request): Promise<Response> {
  const unconfigured = missingKey();
  if (unconfigured) return unconfigured;

  const body = await readBody(request);
  if (!body) return Response.json({ error: "Expected a JSON body." }, { status: 400 });

  const parsed = parseSource(body.source);
  if (!parsed) {
    return Response.json({ error: "`source` must be a non-empty string." }, { status: 400 });
  }

  try {
    const detection = await detectLanguage(parsed.source);
    return Response.json({ ...detection, truncated: parsed.truncated });
  } catch (error) {
    console.error("[agent/highlight/language] evaluation failed:", error);
    return Response.json({ error: "The model call failed." }, { status: 502 });
  }
}
