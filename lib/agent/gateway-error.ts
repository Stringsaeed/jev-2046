/**
 * Telling gateway failures apart.
 *
 * Every model call in here used to end up as one generic "The model call
 * failed", which is the wrong thing to say for the failure that matters most:
 * a spend budget running out. That one is not a fault, it is the cap doing its
 * job, and a visitor should be told so rather than being left to retry into a
 * wall.
 *
 * The status is not reliably on the error the SDK throws. A budget rejection is
 * an HTTP 402 at the gateway, but it can arrive as a `GatewayInternalServerError`
 * wrapped in a `RetryError` wrapped around an `APICallError`, so this reads the
 * whole chain — status codes and text alike — rather than one field.
 */

export type GatewayFailure =
  /** A team, project, key, or user spend budget is exhausted. */
  | "budget"
  /** The request itself was too big for the model, however many retries. */
  | "too-large"
  | "rate-limited"
  | "unavailable";

/** Every nested error, flattened. Bounded so a cycle cannot hang the handler. */
function* walk(error: unknown, seen = new Set<unknown>(), depth = 0): Generator<object> {
  if (depth > 8 || typeof error !== "object" || error === null || seen.has(error)) return;
  seen.add(error);

  yield error as object;

  const node = error as Record<string, unknown>;
  yield* walk(node.cause, seen, depth + 1);
  yield* walk(node.lastError, seen, depth + 1);
  if (Array.isArray(node.errors)) {
    for (const nested of node.errors) yield* walk(nested, seen, depth + 1);
  }
}

/** Status codes and text from anywhere in the chain. */
function evidence(error: unknown): { statuses: number[]; text: string } {
  const statuses: number[] = [];
  const text: string[] = [];

  for (const node of walk(error)) {
    const record = node as Record<string, unknown>;
    if (typeof record.statusCode === "number") statuses.push(record.statusCode);
    for (const field of ["message", "type", "responseBody"]) {
      if (typeof record[field] === "string") text.push(record[field] as string);
    }
    // `data` carries the parsed error body on an APICallError.
    if (record.data && typeof record.data === "object") {
      try {
        text.push(JSON.stringify(record.data));
      } catch {
        // Circular or otherwise unserializable: the other fields still count.
      }
    }
  }

  return { statuses, text: text.join(" ").toLowerCase() };
}

export function classifyGatewayError(error: unknown): GatewayFailure {
  const { statuses, text } = evidence(error);

  // `quota_for_entity_exceeded` is the gateway's own type for every budget
  // scope, so it identifies the case even when the status has been rewritten.
  if (
    statuses.includes(402) ||
    text.includes("quota_for_entity_exceeded") ||
    text.includes("budget exceeded") ||
    text.includes("quota limit exceeded")
  ) {
    return "budget";
  }

  if (statuses.includes(413) || text.includes("max_tokens_exceeded")) return "too-large";
  if (statuses.includes(429) || text.includes("rate_limit")) return "rate-limited";
  return "unavailable";
}

const RESPONSES: Record<GatewayFailure, { status: number; error: string }> = {
  budget: {
    status: 402,
    error: "This demo has reached its model spending cap. Try again once the budget resets.",
  },
  "too-large": {
    status: 413,
    error: "That paste needs more questions than one request can carry. Try a shorter snippet.",
  },
  "rate-limited": {
    status: 429,
    error: "The model is rate limiting requests right now. Try again in a moment.",
  },
  unavailable: { status: 502, error: "The model call failed." },
};

/**
 * The response to send a caller. Logs the real error server-side either way —
 * the visitor gets the category, the server log keeps the detail.
 */
export function gatewayErrorResponse(scope: string, error: unknown): Response {
  const failure = classifyGatewayError(error);
  const { status, error: message } = RESPONSES[failure];
  console.error(`[${scope}] evaluation failed (${failure}):`, error);
  return Response.json({ error: message, failure }, { status });
}
