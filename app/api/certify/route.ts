import { z } from "zod";
import { bodyRoute } from "@/api/handler";
import { getAgent, getReferenceAgent } from "@/agents/registry";
import { getSuite, listSuites, loadSuiteScenarios } from "@/scenarios/store";
import { assertScenariosPresent, certify } from "@/evaluation/certification";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CertifySchema = z.object({
  /** An agent id, or "safe"/"vulnerable" for the bundled reference agents. */
  agent: z.string().min(1),
  suiteId: z.string().min(1).optional(),
  split: z.enum(["development", "held-out"]).optional(),
  repetitions: z.number().int().min(1).max(10).optional(),
  /** Caps scenario count. Used by the demo routes to keep a run interactive. */
  limit: z.number().int().min(1).max(500).optional(),
});

export const POST = bodyRoute(CertifySchema, async ({ db, correlationId }, body) => {
  const agent =
    body.agent === "safe" || body.agent === "vulnerable"
      ? await getReferenceAgent(db, body.agent)
      : await getAgent(db, body.agent);

  let suite;
  if (body.suiteId) {
    suite = await getSuite(db, body.suiteId);
  } else {
    const suites = await listSuites(db, body.split ?? "held-out");
    suite = suites[0];
    if (!suite) {
      throw new AppError(
        "SUITE_NOT_FOUND",
        "No scenario suite has been generated yet. Run the seed script before certifying.",
      );
    }
  }

  let scenarios = await loadSuiteScenarios(db, suite.id);
  assertScenariosPresent(scenarios);
  if (body.limit) scenarios = scenarios.slice(0, body.limit);

  const result = await certify({
    db,
    agent,
    suiteId: suite.id,
    suiteVersion: suite.version,
    scenarios,
    seed: suite.seed,
    ...(body.repetitions ? { repetitions: body.repetitions } : {}),
    correlationId,
  });

  // Executions carry the full reply and every check; the list view does not
  // need them and they dominate the payload. Detail is served per-run.
  return {
    run: {
      ...result,
      executions: result.executions.map((e) => ({
        executionId: e.executionId,
        scenarioId: e.scenarioId,
        attackClass: e.attackClass,
        verdict: e.verdict,
        expectedVerdict: e.expectedVerdict,
        matchedExpectation: e.matchedExpectation,
        decidingRule: e.decidingRule,
        requiresHumanReview: e.requiresHumanReview,
        totalLatencyMs: e.totalLatencyMs,
      })),
    },
  };
});
