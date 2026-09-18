import { redirect } from "next/navigation";

/**
 * The 2048 demo is off.
 *
 * Jev did not earn its place in it: code already scores all four moves, so the
 * judgement left over is close to a `Math.min`, and a one-move read with no
 * lookahead stalls or loses outright. Until that has an answer, the demo is not
 * reachable — the page redirects, `app/api/agent/move` is gone, and the nav no
 * longer lists it.
 *
 * Nothing else was deleted. `lib/game`, `components/game` and `hooks/use-jev-agent`
 * are all intact, so bringing it back is this file plus a route handler.
 *
 * Temporary on purpose: 307, not 308, so no browser caches this permanently.
 */
export default function Home() {
  redirect("/connections");
}
