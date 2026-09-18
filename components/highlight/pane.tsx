"use client";

import type { ReactNode } from "react";

/**
 * The card chrome the three panels share: a titled header and a body that
 * fills whatever height it is given. Height comes from the parent, because in
 * the resizable layout the parent is a panel the reader is dragging.
 */
export function Pane({
  title,
  trailing,
  children,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b px-3">
        <span className="text-muted-foreground truncate text-xs font-medium">{title}</span>
        {trailing}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
