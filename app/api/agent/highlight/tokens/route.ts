import { withCache } from "@/lib/agent/cache";
import { gatewayErrorResponse } from "@/lib/agent/gateway-error";
import { classifyTokens } from "@/lib/agent/highlight-jev";
import { isCommentStyle, isLanguageId } from "@/lib/highlight/languages";

import { missingKey, parseSource, readBody } from "../../request";

/**
 * Round two: one classification per identifier, given the language round one
 * settled. The language arrives from the client, but it is re-checked against
 * the known set rather than trusted, and the source is re-lexed here — the
 * spans this returns are the server's own, not the browser's.
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

  if (!isLanguageId(body.language)) {
    return Response.json({ error: "`language` must be a known language id." }, { status: 400 });
  }
  const language = body.language;

  const commentStyle = isCommentStyle(body.commentStyle) ? body.commentStyle : undefined;

  try {
    // Every input the answers depend on is in the key: a different language or
    // comment style lexes differently and so asks different questions.
    const { value, cached } = await withCache(
      ["tokens", parsed.source, language, commentStyle ?? ""],
      () => classifyTokens(parsed.source, language, commentStyle),
    );
    return Response.json({ ...value, cached, truncated: parsed.truncated });
  } catch (error) {
    return gatewayErrorResponse("agent/highlight/tokens", error);
  }
}
