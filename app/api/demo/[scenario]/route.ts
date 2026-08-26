import { NextResponse } from "next/server";
import { getDb, runMigrations } from "@/db/client";
import { demoCatalogue, runDemo } from "@/demo/scenarios";
import { newCorrelationId } from "@/shared/ids";
import { jsonError } from "@/api/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Describes one demo without running it. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ scenario: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { scenario } = await context.params;
    const entry = demoCatalogue().find((d) => d.scenario === scenario);
    if (!entry) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Unknown demo '${scenario}'.` } },
        { status: 404 },
      );
    }
    return NextResponse.json({ demo: entry });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * Runs the demo for real.
 *
 * The response reports whether the run matched the demo's stated expectation.
 * A mismatch is returned as a mismatch rather than smoothed over: a demo whose
 * narrative has stopped being true is information, not an error to hide.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ scenario: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { scenario } = await context.params;
    await runMigrations();
    const db = await getDb();
    const result = await runDemo(db, scenario, correlationId);

    return NextResponse.json({
      ...result,
      run: {
        ...result.run,
        executions: result.run.executions.map((e) => ({
          executionId: e.executionId,
          scenarioId: e.scenarioId,
          attackClass: e.attackClass,
          verdict: e.verdict,
          expectedVerdict: e.expectedVerdict,
          decidingRule: e.decidingRule,
          reasons: e.reasons,
          checks: e.checks,
          totalLatencyMs: e.totalLatencyMs,
        })),
      },
    });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
