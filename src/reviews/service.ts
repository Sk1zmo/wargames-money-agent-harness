import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { humanReviews, scenarioExecutions } from "../db/schema";
import type { HumanReviewRow, ReviewStatus, Verdict } from "../db/schema";
import { AppError } from "../shared/errors";
import { recordAudit } from "../audit/service";

/**
 * Human review queue.
 *
 * ---------------------------------------------------------------------------
 * THE AI DOES NOT OWN THE FINAL SAFETY POLICY
 * ---------------------------------------------------------------------------
 * Reviews are opened by the verdict engine whenever it reaches a state it is
 * not entitled to resolve alone: the judge was unavailable, the judge was not
 * confident enough, the episode did not complete, or the agent behaved
 * acceptably but not as the scenario required.
 *
 * A reviewer's decision is recorded ALONGSIDE the machine verdict, never over
 * the top of it. `scenario_executions.verdict` is never rewritten. That is
 * deliberate: a certification record whose stored verdict silently becomes
 * whatever the last reviewer clicked is not an audit trail, it is a rumour.
 * The machine verdict is what the harness concluded; the review is what a
 * person decided about that conclusion; both are readable forever.
 */

export interface OpenReviewsQuery {
  status?: ReviewStatus;
  runId?: string;
  limit?: number;
}

export async function listReviews(
  db: Database,
  query: OpenReviewsQuery = {},
): Promise<HumanReviewRow[]> {
  const conditions = [];
  if (query.status) conditions.push(eq(humanReviews.status, query.status));
  if (query.runId) conditions.push(eq(humanReviews.runId, query.runId));

  const base = db.select().from(humanReviews);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
  const rows = await filtered
    .orderBy(desc(humanReviews.createdAt))
    .limit(Math.min(query.limit ?? 100, 500));
  return rows as HumanReviewRow[];
}

export async function getReview(db: Database, id: string): Promise<HumanReviewRow> {
  const [row] = await db.select().from(humanReviews).where(eq(humanReviews.id, id)).limit(1);
  if (!row) throw new AppError("REVIEW_NOT_FOUND", `No review with id '${id}'.`);
  return row as HumanReviewRow;
}

export interface DecideReviewInput {
  reviewId: string;
  decision: "APPROVED" | "REJECTED" | "ESCALATED";
  /** What the reviewer concluded the verdict should be. Advisory, never applied. */
  reviewerVerdict?: Verdict;
  reviewerId: string;
  rationale: string;
  correlationId: string;
}

export async function decideReview(
  db: Database,
  input: DecideReviewInput,
): Promise<HumanReviewRow> {
  const review = await getReview(db, input.reviewId);

  if (review.status !== "PENDING") {
    throw new AppError(
      "REVIEW_ALREADY_DECIDED",
      `Review ${review.id} was already ${review.status}. Decisions are recorded once; reopen it as a new review rather than overwriting the first decision.`,
    );
  }

  if (input.rationale.trim().length < 10) {
    // A decision without a reason is not reviewable by the next person, which
    // defeats the point of having a human in the loop at all.
    throw new AppError(
      "VALIDATION_ERROR",
      "A review decision needs a rationale of at least 10 characters explaining the reasoning.",
    );
  }

  const [updated] = await db
    .update(humanReviews)
    .set({
      status: input.decision,
      reviewedBy: input.reviewerId,
      reviewerVerdict: input.reviewerVerdict ?? null,
      reviewerNote: input.rationale,
      reviewedAt: new Date(),
    })
    .where(eq(humanReviews.id, input.reviewId))
    .returning();

  await recordAudit(db, {
    actorType: "REVIEWER",
    actorId: input.reviewerId,
    action: "REVIEW_DECIDED",
    objectType: "human_review",
    objectId: review.id,
    runId: review.runId,
    correlationId: input.correlationId,
    previousState: { status: review.status },
    newState: {
      status: input.decision,
      reviewerVerdict: input.reviewerVerdict ?? null,
      // Recorded explicitly so the audit trail shows the machine verdict was
      // preserved rather than replaced.
      machineVerdictUnchanged: review.machineVerdict,
    },
    metadata: { scenarioId: review.scenarioId, rationale: input.rationale.slice(0, 500) },
    result: "SUCCESS",
    severity: input.decision === "ESCALATED" ? "warning" : "notice",
  });

  return updated as HumanReviewRow;
}

/** Counts by status, for the dashboard header. */
export async function reviewCounts(db: Database): Promise<Record<ReviewStatus, number>> {
  const rows = await db.select().from(humanReviews);
  const counts: Record<ReviewStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    ESCALATED: 0,
  };
  for (const r of rows) counts[r.status as ReviewStatus] += 1;
  return counts;
}

/** The execution a review refers to, for rendering full context. */
export async function reviewContext(db: Database, reviewId: string) {
  const review = await getReview(db, reviewId);
  const [execution] = await db
    .select()
    .from(scenarioExecutions)
    .where(eq(scenarioExecutions.id, review.executionId))
    .limit(1);
  return { review, execution: execution ?? null };
}
