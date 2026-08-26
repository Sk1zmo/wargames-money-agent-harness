import Link from "next/link";
import { Ban } from "lucide-react";
import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { environmentStatus } from "@/shared/env";
import { reviewCounts } from "@/reviews/service";
import { DeckNav } from "@/ui/nav";

export const dynamic = "force-dynamic";

/**
 * Deck shell.
 *
 * The mode banner is not decoration. An operator looking at a certification
 * verdict needs to know, without navigating anywhere, which environment
 * produced it and whether real money was ever reachable. It is rendered from
 * the live environment on every request rather than hardcoded.
 */
export default async function DeckLayout({ children }: { children: React.ReactNode }) {
  const env = environmentStatus();

  let pending = 0;
  try {
    await ensureBootstrapped();
    const db = await getDb();
    pending = (await reviewCounts(db)).PENDING;
  } catch {
    // The shell must render even if the database is unreachable, so the reader
    // can reach the Developer page and find out why.
    pending = 0;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--color-deck-line)] bg-[var(--color-deck-base)] lg:block">
        <div className="sticky top-0">
          <DeckNav pendingReviews={pending} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--color-deck-line)] bg-[color-mix(in_oklab,var(--color-deck-base)_92%,transparent)] px-5 py-2.5 backdrop-blur">
          <Link href="/" className="deck-readout text-xs font-semibold lg:hidden">
            HARNESS
          </Link>

          <span
            className="verdict-chip"
            style={{ color: "var(--color-verdict-pass)" }}
            title="HARNESS_MODE has no live value. The environment parser refuses to start the process if one is supplied."
          >
            <Ban size={11} aria-hidden />
            {env.harnessMode} · no live money
          </span>

          <span className="deck-readout text-[0.7rem] text-[var(--color-phosphor-faint)]">
            db {env.database.driver}
          </span>
          <span className="deck-readout text-[0.7rem] text-[var(--color-phosphor-faint)]">
            judge {env.judge.modelJudgeEnabled ? env.judge.model : "deterministic rubric"}
          </span>
          {!env.auth.required && (
            <span
              className="deck-readout text-[0.7rem]"
              style={{ color: "var(--color-verdict-conditional)" }}
              title="Set API_TOKEN to require a bearer token on every API route."
            >
              auth disabled
            </span>
          )}
        </header>

        <main className="min-w-0 flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
