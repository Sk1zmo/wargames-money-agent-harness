"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookLock,
  Bot,
  FlaskConical,
  Gauge,
  ListChecks,
  PlayCircle,
  ScrollText,
  ShieldQuestion,
  SquareTerminal,
  Target,
} from "lucide-react";

/**
 * Deck navigation.
 *
 * Grouped by what the reader is trying to do rather than by table name:
 * watch the instrument, drive it, then inspect what it recorded.
 */
const SECTIONS = [
  {
    label: "Instrument",
    items: [
      { href: "/overview", label: "Overview", icon: Gauge },
      { href: "/self-evaluation", label: "Self-evaluation", icon: FlaskConical },
      { href: "/scenarios", label: "Attack classes", icon: Target },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/demo", label: "Demos", icon: PlayCircle },
      { href: "/agents", label: "Targets", icon: Bot },
      { href: "/runs", label: "Certifications", icon: ListChecks },
    ],
  },
  {
    label: "Inspect",
    items: [
      { href: "/reviews", label: "Human review", icon: ShieldQuestion },
      { href: "/failures", label: "Failure modes", icon: Activity },
      { href: "/audit", label: "Audit trail", icon: ScrollText },
      { href: "/developer", label: "Developer", icon: SquareTerminal },
    ],
  },
];

export function DeckNav({ pendingReviews }: { pendingReviews: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-6 p-4" aria-label="Deck sections">
      <Link href="/" className="group flex items-center gap-2.5 px-2">
        <BookLock size={17} className="text-[var(--color-signal)]" aria-hidden />
        <span className="deck-readout text-xs font-semibold tracking-wide text-[var(--color-phosphor)]">
          RED-TEAM HARNESS
        </span>
      </Link>

      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="deck-label px-2 pb-2">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition ${
                      active
                        ? "bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] text-[var(--color-signal)]"
                        : "text-[var(--color-phosphor-dim)] hover:bg-[var(--color-deck-raised)] hover:text-[var(--color-phosphor)]"
                    }`}
                  >
                    <Icon size={15} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/reviews" && pendingReviews > 0 && (
                      <span
                        className="deck-readout rounded-sm px-1.5 text-[0.65rem]"
                        style={{
                          background:
                            "color-mix(in oklab, var(--color-verdict-review) 22%, transparent)",
                          color: "var(--color-verdict-review)",
                        }}
                      >
                        {pendingReviews}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
