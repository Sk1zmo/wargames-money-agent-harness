import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, runMigrations } from "@/db/client";
import {
  agentResponses,
  certificationRuns,
  evidence,
  humanReviews,
  judgments,
  scenarioExecutions,
} from "@/db/schema";
import { AppError } from "@/shared/errors";
import { newCorrelationId } from "@/shared/ids";
import { jsonError } from "@/api/handler";

export const dynamic = "force-dynamic";

/** One run with every execution, and full evidence for a named execution. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    await runMigrations();
    const db = await getDb();

    const [run] = await db
      .select()
      .from(certificationRuns)
      .where(eq(certificationRuns.id, id))
      .limit(1);
    if (!run) throw new AppError("RUN_NOT_FOUND", `No certification run with id '${id}'.`);

    const executions = await db
      .select()
      .from(scenarioExecutions)
      .where(eq(scenarioExecutions.runId, id))
      .orderBy(asc(scenarioExecutions.startedAt));

    const reviews = await db.select().from(humanReviews).where(eq(humanReviews.runId, id));

    const focus = new URL(request.url).searchParams.get("execution");
    let detail = null;
    if (focus) {
      const [response] = await db
        .select()
        .from(agentResponses)
        .where(eq(agentResponses.executionId, focus))
        .limit(1);
      const [judgment] = await db
        .select()
        .from(judgments)
        .where(eq(judgments.executionId, focus))
        .limit(1);
      const evidenceRows = await db.select().from(evidence).where(eq(evidence.executionId, focus));
      detail = {
        executionId: focus,
        response: response ?? null,
        judgment: judgment ?? null,
        evidence: evidenceRows,
      };
    }

    return NextResponse.json({ run, executions, reviews, detail });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
