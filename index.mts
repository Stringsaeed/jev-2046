/**
 * Jev plays 2048.
 *
 * Feeds a real board from the game engine to TypeSafe's Jev model through the
 * Vercel AI Gateway and asks one typed question: which way should the player
 * swipe? Jev answers with a probability across up / right / down / left rather
 * than prose, and the engine plays the direction it picks.
 *
 *   pnpm jev                 one board, one decision
 *   pnpm jev --moves 10      let Jev play ten moves
 *   pnpm jev --seed 2048     replay an exact game
 *
 * Needs AI_GATEWAY_API_KEY, which the script loads from .env.local.
 */
import { chooseDirection, DIRECTION_ORDER, JEV_MODEL } from "./lib/agent/jev.ts";
import { availableMoves, createGame, move, settle, toGrid } from "./lib/game/engine.ts";
import type { GameState } from "./lib/game/types.ts";

const ARROWS = { up: "↑", right: "→", down: "↓", left: "←" } as const;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function renderBoard(state: GameState): string {
  return toGrid(state)
    .map((row) => row.map((v) => (v === 0 ? "    ·" : String(v).padStart(5))).join(" "))
    .join("\n");
}

function renderDistribution(decision: Awaited<ReturnType<typeof chooseDirection>>): string {
  const ranked = [...DIRECTION_ORDER].sort(
    (a, b) => decision.probabilities[b] - decision.probabilities[a],
  );

  return ranked
    .map((direction) => {
      const probability = decision.probabilities[direction];
      const bar = "█".repeat(Math.round(probability * 24)).padEnd(24, "·");
      const label = `${ARROWS[direction]} ${direction}`.padEnd(8);
      const note = decision.legal.includes(direction) ? "" : "  (unavailable)";
      return `  ${label} ${bar} ${probability.toFixed(2)}${note}`;
    })
    .join("\n");
}

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error(
    "AI_GATEWAY_API_KEY is not set.\n" +
      "Create one with:  npx vercel@latest ai-gateway api-keys create --name <name>\n" +
      "then put it in .env.local as AI_GATEWAY_API_KEY=...",
  );
  process.exit(1);
}

const totalMoves = Number(flag("moves") ?? 1);
const seed = Number(flag("seed") ?? Math.floor(Math.random() * 2 ** 31));

let state = createGame({ seed });
let inputTokens = 0;
let outputTokens = 0;

console.log(`model  ${JEV_MODEL}  (via Vercel AI Gateway)`);
console.log(`seed   ${seed}\n`);

for (let turn = 1; turn <= totalMoves; turn += 1) {
  if (availableMoves(state).length === 0) {
    console.log(`Game over after ${state.moves} moves. Final score ${state.score}.\n`);
    break;
  }

  console.log(`── move ${turn}  ·  score ${state.score}  ──`);
  console.log(renderBoard(state));

  const decision = await chooseDirection(state);
  inputTokens += decision.usage.inputTokens ?? 0;
  outputTokens += decision.usage.outputTokens ?? 0;

  console.log("");
  console.log(renderDistribution(decision));

  const confidence =
    decision.confidence === undefined ? "" : `  ·  confidence ${decision.confidence.toFixed(2)}`;
  console.log(`\n  → plays ${decision.direction.toUpperCase()}${confidence}`);

  if (decision.usedFallback) {
    console.log(
      `  ! Jev chose ${decision.modelChoice}, which is not available here; ` +
        `played the most likely legal direction instead.`,
    );
  }

  state = settle(move(state, decision.direction));
  console.log("");
}

console.log("── final ──");
console.log(renderBoard(state));
console.log(
  `\nscore ${state.score}  ·  best tile ${state.highest}  ·  ${state.moves} moves` +
    `\ntokens ${inputTokens} in / ${outputTokens} out`,
);
