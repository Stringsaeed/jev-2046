/**
 * Starting points for the demo. Deliberately spread across families the same
 * lexer has to survive — braces, indentation, sigils, markup and a query
 * language — and deliberately full of words whose role depends on where they
 * sit rather than on what they are spelled.
 */

export interface Sample {
  name: string;
  /** Not shown to the model. The point is that nothing tells it the language. */
  source: string;
}

export const SAMPLES: Sample[] = [
  {
    name: "React",
    source: `import { useMemo, useState } from "react";

interface Row {
  id: string;
  label: string;
  total: number;
}

const FALLBACK: Row[] = [];

export function Ledger({ rows = FALLBACK, query }: { rows?: Row[]; query: string }) {
  const [open, setOpen] = useState(false);

  const visible = useMemo(
    () => rows.filter((row) => row.label.toLowerCase().includes(query.trim())),
    [rows, query],
  );

  return (
    <section className="ledger" aria-expanded={open}>
      <button onClick={() => setOpen(!open)}>{visible.length} rows</button>
      {open && visible.map((row) => <Row key={row.id} {...row} />)}
    </section>
  );
}`,
  },
  {
    name: "Python",
    source: `import asyncio
from dataclasses import dataclass, field

MAX_RETRIES = 3


@dataclass
class Fetcher:
    """Pulls pages until the queue drains."""

    base: str
    seen: set[str] = field(default_factory=set)

    async def fetch(self, path: str) -> dict | None:
        for attempt in range(MAX_RETRIES):
            try:
                return await self.client.get(f"{self.base}/{path}")
            except TimeoutError:
                await asyncio.sleep(2**attempt)
        return None


if __name__ == "__main__":
    asyncio.run(Fetcher(base="https://example.com").fetch("index"))`,
  },
  {
    name: "Rust",
    source: `use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Index {
    entries: HashMap<String, usize>,
}

impl Index {
    pub fn new() -> Self {
        Index { entries: HashMap::new() }
    }

    /// Records a term and returns how many times it has been seen.
    pub fn bump(&mut self, term: &str) -> usize {
        let count = self.entries.entry(term.to_string()).or_insert(0);
        *count += 1;
        *count
    }
}

fn main() {
    let mut index = Index::new();
    for word in "the quick brown the".split_whitespace() {
        println!("{} -> {}", word, index.bump(word));
    }
}`,
  },
  {
    name: "Go",
    source: `package store

import (
	"context"
	"errors"
	"time"
)

var ErrMissing = errors.New("store: key not found")

type Entry struct {
	Key       string    \`json:"key"\`
	Value     []byte    \`json:"value"\`
	ExpiresAt time.Time \`json:"expires_at"\`
}

type Store interface {
	Get(ctx context.Context, key string) (Entry, error)
}

func Fresh(e Entry, now time.Time) bool {
	if e.ExpiresAt.IsZero() {
		return true
	}
	return e.ExpiresAt.After(now)
}`,
  },
  {
    name: "SQL",
    source: `-- Monthly revenue per plan, excluding trials.
WITH active AS (
  SELECT
    s.account_id,
    s.plan,
    s.amount_cents
  FROM subscriptions AS s
  WHERE s.status = 'active'
    AND s.trial_ends_at IS NULL
)
SELECT
  plan,
  COUNT(*) AS accounts,
  SUM(amount_cents) / 100.0 AS revenue
FROM active
GROUP BY plan
HAVING COUNT(*) > 5
ORDER BY revenue DESC;`,
  },
  {
    name: "Elixir",
    source: `defmodule Billing.Invoice do
  @moduledoc "Totals line items and applies a single discount."

  @rate 0.0825

  defstruct [:id, :customer, items: [], discount: nil]

  def total(%__MODULE__{items: items, discount: discount}) do
    items
    |> Enum.map(& &1.cents)
    |> Enum.sum()
    |> apply_discount(discount)
    |> with_tax()
  end

  defp apply_discount(cents, nil), do: cents
  defp apply_discount(cents, percent), do: round(cents * (1 - percent))

  defp with_tax(cents), do: round(cents * (1 + @rate))
end`,
  },
  {
    name: "Flawed",
    source: `// Returns the user's full profile, or null when the id is unknown.
export async function loadProfile(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const key = "sk_live_51H8xQ2Kj9mNpLwR3";

  let d;
  try {
    d = await db.query("SELECT * FROM users WHERE id = " + id);
  } catch {
    return {};
  }

  const tmp = d.rows[0];
  cache.set(id, tmp, 86400);
  audit.record(id, "profile.read", key);

  if (tmp.roles.length > 0) {
    tmp.roles.sort();
  }

  return {
    name: tmp.name,
    seenAt: Date.now() - 3600 * 1000,
  };
}\``,
  },
];
