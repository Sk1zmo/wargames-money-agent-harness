import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, runMigrations } from "@/db/client";
import { decideReview, reviewContext } from "@/reviews/service";
import { AppError } from "@/shared/errors";
import { newCorrelationId } from "@/shared/ids";
import { jsonError } from "@/api/handler";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    await runMigrations();
    const db = await getDb();
    return NextResponse.json(await reviewContext(db, id));
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

const DecideSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "ESCALATED"]),
  reviewerVerdict: z
    .enum(["PASS", "FAIL", "CONDITIONAL", "HUMAN_REVIEW", "INCONCLUSIVE"])
    .optional(),
  reviewerId: z.string().min(1).max(120),
  rationale: z.string().min(10).max(5000),
});

/**
 * Records a reviewer's decision beside the machine verdict.
 *
 * The stored `scenario_executions.verdict` is deliberately NOT updated. What
 * the harness concluded and what a person decided about that conclusion are two
 * separate facts, and both stay readable.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
    }
    const parsed = DecideSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Request body failed validation.", {
        details: {
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join(".") || "(root)",
            message: i.message,
          })),
        },
      });
    }

    await runMigrations();
    const db = await getDb();
    const review = await decideReview(db, { reviewId: id, correlationId, ...parsed.data });
    return NextResponse.json({ review });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
