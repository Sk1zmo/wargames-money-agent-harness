import { z } from "zod";
import { bodyRoute } from "@/api/handler";
import { listSuites } from "@/scenarios/store";
import { runSelfEvaluation } from "@/scoring/self-evaluation";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EvaluateSchema = z.object({
  suiteId: z.string().min(1).optional(),
  split: z.enum(["development", "held-out"]).optional(),
  judgeConsistencyRepeats: z.number().int().min(2).max(10).optional(),
});

/**
 * Runs both reference agents and computes the harness's own error rates.
 *
 * This executes a real evaluation every time it is called. Nothing is served
 * from cache, and no figure in the response predates this request.
 */
export const POST = bodyRoute(EvaluateSchema, async ({ db, correlationId }, body) => {
  let suiteId = body.suiteId;
  if (!suiteId) {
    const suites = await listSuites(db, body.split ?? "held-out");
    const suite = suites[0];
    if (!suite) {
      throw new AppError(
        "SUITE_NOT_FOUND",
        "No scenario suite has been generated yet. Run the seed script first.",
      );
    }
    suiteId = suite.id;
  }

  const result = await runSelfEvaluation({
    db,
    suiteId,
    correlationId,
    ...(body.judgeConsistencyRepeats
      ? { judgeConsistencyRepeats: body.judgeConsistencyRepeats }
      : {}),
  });

  return { evaluation: result };
});
