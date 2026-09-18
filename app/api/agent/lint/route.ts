import { withCache } from "@/lib/agent/cache";
import { gatewayErrorResponse } from "@/lib/agent/gateway-error";
import { lintSource } from "@/lib/agent/lint-jev";
import { isCommentStyle, isLanguageId } from "@/lib/highlight/languages";

import { missingKey, parseSource, readBody } from "../request";

/**
 * Both lint passes behind one request. The gate has to answer before there is
 * anything to ask line by line, but that ordering is the server's business —
 * the browser sends a file and a language and gets back the findings.
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
    const { value, cached } = await withCache(
      ["lint", parsed.source, language, commentStyle ?? ""],
      () => lintSource(parsed.source, language, commentStyle),
    );
    return Response.json({ ...value, cached, truncated: parsed.truncated });
  } catch (error) {
    return gatewayErrorResponse("agent/lint", error);
  }
}
