"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  // 2048 is disabled: `/` redirects and its agent route is gone. See app/page.tsx.
  { href: "/connections", label: "Connections" },
  { href: "/highlight", label: "Highlighter" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-center gap-1 p-3">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
