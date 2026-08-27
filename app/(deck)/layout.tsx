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
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
