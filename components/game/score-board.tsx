"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface ScoreBoardProps {
  score: number;
  bestScore: number;
  /** Points earned by the last move — floats up over the score. */
  gained: number;
  /** Changes on every move, so a repeated gain still replays the animation. */
  moveKey: number;
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground relative flex min-w-[6.5rem] flex-col items-center rounded-xl border px-4 py-2 shadow-sm">
      <span className="text-muted-foreground text-[0.65rem] font-semibold tracking-[0.18em] uppercase">
        {label}
      </span>
      <span className="font-mono text-2xl leading-tight font-bold tabular-nums">
        {value.toLocaleString()}
      </span>
      {children}
    </div>
  );
}

export function ScoreBoard({ score, bestScore, gained, moveKey }: ScoreBoardProps) {
  const floatRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = floatRef.current;
      if (!el || gained <= 0) return;
      gsap.fromTo(
        el,
        { y: 4, autoAlpha: 1, scale: 0.9 },
        { y: -34, autoAlpha: 0, scale: 1.1, duration: 0.75, ease: "power2.out" },
      );
    },
    { dependencies: [moveKey] },
  );

  return (
    <div className="flex items-stretch gap-2">
      <Stat label="Score" value={score}>
        <span
          ref={floatRef}
          aria-hidden
          className="pointer-events-none absolute -top-1 right-2 font-mono text-sm font-bold text-emerald-500 opacity-0"
        >
          +{gained}
        </span>
      </Stat>
      <Stat label="Best" value={bestScore} />
    </div>
  );
}
