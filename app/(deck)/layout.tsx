import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { environmentStatus } from "@/shared/env";
import { reviewCounts } from "@/reviews/service";
import { DeckRail } from "@/ui/deck-rail";

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
    <div className="min-h-screen bg-[var(--color-deck-void)]">
      <DeckRail pendingReviews={pending} mode={env.harnessMode ?? "SIMULATED"} />
      {/* The gutter lives in the `page` class, not in utilities: a Tailwind
          px-* sits in a later cascade layer and would silently beat it. */}
      <main className="page py-6">{children}</main>
    </div>
  );
}
