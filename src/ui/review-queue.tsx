"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { HumanReviewRow, Verdict } from "../db/schema";
import { ErrorNote, Panel, VerdictChip } from "./primitives";

/**
 * The review queue.
 *
 * A decision requires a rationale. The server enforces a minimum length and so
 * does this form, because a decision nobody can read later is not a review — it
 * is a click, and the next person inherits no information from it.
 */
export function ReviewQueue({ reviews }: { reviews: HumanReviewRow[] }) {
  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: HumanReviewRow }) {
  const router = useRouter();
  const [reviewerId, setReviewerId] = useState("");
  const [rationale, setRationale] = useState("");
  const [reviewerVerdict, setReviewerVerdict] = useState<Verdict | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; correlationId?: string } | null>(null);

  const decided = review.status !== "PENDING";
  const canSubmit = reviewerId.trim().length > 0 && rationale.trim().length >= 10 && !busy;

  async function decide(decision: "APPROVED" | "REJECTED" | "ESCALATED") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${review.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewerId: reviewerId.trim(),
          rationale: rationale.trim(),
          ...(reviewerVerdict ? { reviewerVerdict } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError({
          message: payload?.error?.message ?? `Request failed with ${response.status}.`,
          correlationId: payload?.error?.correlationId,
        });
        return;
      }
      router.refresh();
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "Could not reach the harness.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={review.reasonCode}
      subtitle={review.reasonDetail}
      action={
        <span
          className="deck-readout shrink-0 text-[0.65rem]"
          style={{
            color: decided ? "var(--color-phosphor-faint)" : "var(--color-verdict-review)",
          }}
        >
          {review.status}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="deck-label">Machine verdict</span>
          <VerdictChip verdict={review.machineVerdict} />
          <span className="deck-readout text-[0.65rem] text-[var(--color-phosphor-faint)]">
            {review.scenarioId}
          </span>
        </div>

        {review.machineReasons.length > 0 && (
          <ul className="space-y-0.5 border-l border-[var(--color-deck-line)] pl-3">
            {review.machineReasons.map((r, i) => (
              <li key={i} className="text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
                {r}
              </li>
            ))}
          </ul>
        )}

        {decided ? (
          <div className="border-t border-[var(--color-deck-line)] pt-3">
            <p className="deck-label mb-1">
              Decided by {review.reviewedBy}
              {review.reviewerVerdict ? ` · suggested ${review.reviewerVerdict}` : ""}
            </p>
            <p className="text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
              {review.reviewerNote}
            </p>
            <p className="mt-2 text-[0.65rem] leading-relaxed text-[var(--color-phosphor-faint)]">
              The machine verdict above is unchanged. This decision was recorded beside it, not over
              it.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 border-t border-[var(--color-deck-line)] pt-3">
            <div className="flex flex-wrap gap-2.5">
              <label className="flex-1">
                <span className="deck-label mb-1 block">Reviewer</span>
                <input
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  placeholder="your name or id"
                  className="deck-readout w-full rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-2.5 py-1.5 text-xs text-[var(--color-phosphor)] placeholder:text-[var(--color-phosphor-faint)]"
                />
              </label>
              <label>
                <span className="deck-label mb-1 block">Your verdict (optional)</span>
                <select
                  value={reviewerVerdict}
                  onChange={(e) => setReviewerVerdict(e.target.value as Verdict | "")}
                  className="deck-readout rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-2.5 py-1.5 text-xs text-[var(--color-phosphor)]"
                >
                  <option value="">—</option>
                  {(["PASS", "FAIL", "CONDITIONAL", "HUMAN_REVIEW", "INCONCLUSIVE"] as Verdict[]).map(
                    (v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="deck-label mb-1 block">
                Rationale (required, min 10 characters)
              </span>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                placeholder="What you concluded and why. The next person reads this instead of guessing."
                className="deck-readout w-full rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--color-phosphor)] placeholder:text-[var(--color-phosphor-faint)]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["APPROVED", "var(--color-verdict-pass)"],
                  ["REJECTED", "var(--color-verdict-fail)"],
                  ["ESCALATED", "var(--color-verdict-conditional)"],
                ] as const
              ).map(([decision, color]) => (
                <button
                  key={decision}
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => decide(decision)}
                  className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ borderColor: color, color }}
                >
                  {busy && <Loader2 size={12} className="animate-spin" aria-hidden />}
                  {decision}
                </button>
              ))}
            </div>

            {error && (
              <ErrorNote
                message={error.message}
                {...(error.correlationId ? { correlationId: error.correlationId } : {})}
              />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
