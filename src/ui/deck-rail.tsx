"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The rail.
 *
 * A war room does not have a navigation sidebar down one wall — it has screens
 * on the wall and a status line above them. The rail is that line: where you
 * are, what mode the harness is in, and how many verdicts are waiting on a
 * person, all on one row that never moves.
 *
 * Losing the sidebar is what makes the wall possible: fifteen attack classes at
 * a readable size need the full width, and squeezed into two-thirds of a screen
 * they stop being glanceable, which is the only property that matters.
 */

const LINKS = [
  { href: "/overview", label: "Wall" },
  { href: "/runs", label: "Runs" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/agents", label: "Agents" },
  { href: "/reviews", label: "Review" },
  { href: "/self-evaluation", label: "Self-eval" },
  { href: "/failures", label: "Failures" },
  { href: "/demo", label: "Walkthrough" },
  { href: "/audit", label: "Record" },
  { href: "/developer", label: "Developer" },
];

export function DeckRail({ pendingReviews, mode }: { pendingReviews: number; mode: string }) {
  const pathname = usePathname();

  return (
    <div className="rail">
      <Link href="/" className="shrink-0 font-[family-name:var(--font-deck)] text-xs font-semibold tracking-[0.2em] text-[var(--color-signal)]">
        RED TEAM HARNESS
      </Link>

      <nav aria-label="Sections" className="flex gap-4">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className="rail-link">
              {link.label}
              {link.href === "/reviews" && pendingReviews > 0 && (
                <span className="ml-1 text-[var(--color-verdict-review)]">{pendingReviews}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <span className="rail-link ml-auto text-[var(--color-verdict-conditional)]">{mode}</span>
      <span className="rail-link">no real money reachable</span>
    </div>
  );
}
