import { withCache } from "@/lib/agent/cache";
import { gatewayErrorResponse } from "@/lib/agent/gateway-error";
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
    const { value, cached } = await withCache(["language", parsed.source], () =>
      detectLanguage(parsed.source),
    );
    return Response.json({ ...value, cached, truncated: parsed.truncated });
  } catch (error) {
    return gatewayErrorResponse("agent/highlight/language", error);
  }
}
