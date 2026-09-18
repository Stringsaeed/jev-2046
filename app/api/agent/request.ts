import { MAX_SOURCE_CHARS } from "@/lib/agent/highlight-jev";

/** Shared request handling for the two highlighter rounds. */

export interface ParsedSource {
  source: string;
  truncated: boolean;
}

export function missingKey(): Response | null {
  return process.env.AI_GATEWAY_API_KEY
    ? null
    : Response.json(
        { error: "AI_GATEWAY_API_KEY is not configured on the server." },
        { status: 503 },
      );
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The paste, bounded. Oversized input is cut rather than refused so a large
 * file still produces a highlighted prefix instead of an error.
 */
export function parseSource(value: unknown): ParsedSource | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;
  return {
    source: value.slice(0, MAX_SOURCE_CHARS),
    truncated: value.length > MAX_SOURCE_CHARS,
  };
}
