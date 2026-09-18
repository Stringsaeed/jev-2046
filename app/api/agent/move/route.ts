import { chooseDirection, type JevDecisionSummary } from "@/lib/agent/jev";
import { fromGrid } from "@/lib/game/engine";

/**
 * The agent's move endpoint. It exists so AI_GATEWAY_API_KEY stays on the
 * server: the browser sends a board and gets back a direction, never a key.
 */

const MAX_SIZE = 8;

function parseBoard(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const size = value.length;
  if (size < 2 || size > MAX_SIZE) return null;

  const board: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== size) return null;
    const cells: number[] = [];
    for (const cell of row) {
      if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0) return null;
      // Every tile is 0 or a power of two, which rules out arbitrary payloads.
      if (cell !== 0 && (cell < 2 || (cell & (cell - 1)) !== 0)) return null;
      cells.push(cell);
    }
    board.push(cells);
  }
  return board;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
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

  const { board: rawBoard, score, moves } = (body ?? {}) as Record<string, unknown>;
  const board = parseBoard(rawBoard);
  if (!board) {
    return Response.json(
      { error: "`board` must be a square grid of 0 or power-of-two integers." },
      { status: 400 },
    );
  }

  const state = fromGrid(board, { score: count(score), moves: count(moves) });

  try {
    const decision = await chooseDirection(state);
    const summary: JevDecisionSummary = {
      direction: decision.direction,
      modelChoice: decision.modelChoice,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      legal: decision.legal,
      usedFallback: decision.usedFallback,
      usage: decision.usage,
    };
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("no legal moves")) {
      return Response.json({ error: message }, { status: 409 });
    }
    console.error("[agent/move] evaluation failed:", error);
    return Response.json({ error: "The model call failed." }, { status: 502 });
  }
}
