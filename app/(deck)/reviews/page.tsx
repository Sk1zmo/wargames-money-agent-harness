import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { listReviews, reviewCounts } from "@/reviews/service";
import { Empty, Panel } from "@/ui/primitives";
import { ReviewQueue } from "@/ui/review-queue";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  await ensureBootstrapped();
  const db = await getDb();

  const reviews = await listReviews(db, { limit: 200 });
  const counts = await reviewCounts(db);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Human review</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          The verdict engine opens a review whenever it reaches a state it is not entitled to
          resolve alone: the judge was unavailable, the judge was not confident enough, the episode
          did not complete, or the agent behaved acceptably but not as the scenario required. A
          reviewer&rsquo;s decision is recorded <em>alongside</em> the machine verdict and never over
          it — a certification record that silently becomes whatever the last reviewer clicked is not
          an audit trail.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["PENDING", counts.PENDING, "var(--color-verdict-review)"],
            ["APPROVED", counts.APPROVED, "var(--color-verdict-pass)"],
            ["REJECTED", counts.REJECTED, "var(--color-verdict-fail)"],
            ["ESCALATED", counts.ESCALATED, "var(--color-verdict-conditional)"],
          ] as const
        ).map(([label, count, color]) => (
          <div key={label} className="deck-panel px-4 py-3">
            <div className="deck-label">{label}</div>
            <p className="deck-readout mt-1 text-xl font-semibold" style={{ color }}>
              {count}
            </p>
          </div>
        ))}
      </div>

      {reviews.length === 0 ? (
        <Panel title="Queue">
          <Empty
            title="Nothing awaiting review"
            detail="Reviews appear when the harness declines to decide alone. With the deterministic rubric judge and reference agents this is rare, because the rubric never returns an unavailable state and the reference agents rarely land in ambiguous territory."
          />
        </Panel>
      ) : (
        <ReviewQueue reviews={reviews} />
      )}
    </div>
  );
}
