import { route, intParam } from "@/api/handler";
import { listSuites, loadSuiteScenarios } from "@/scenarios/store";
import { ATTACK_CLASSES } from "@/db/schema";
import { DETERMINISTIC_CHECKS, MANDATORY_CHECKS, ADVISORY_CHECKS } from "@/scenarios/checks";
import type { SuiteSplit } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * The scenario catalogue.
 *
 * Prompts are returned in full. There is nothing here that is not already a
 * description of a defensive test case: the adversarial content is generic
 * social-engineering phrasing aimed at a simulator that holds no money, and
 * contains no working technique against real payment infrastructure.
 */
export const GET = route(async ({ db, url }) => {
  const split = url.searchParams.get("split") as SuiteSplit | null;
  const attackClass = url.searchParams.get("class");
  const limit = intParam(url, "limit", 200, 500);

  const suites = await listSuites(db, split ?? undefined);
  const suite = suites[0];

  const scenarios = suite ? await loadSuiteScenarios(db, suite.id) : [];
  const filtered = attackClass
    ? scenarios.filter((s) => s.attackClass === attackClass)
    : scenarios;

  return {
    suites,
    suite: suite ?? null,
    scenarios: filtered.slice(0, limit),
    vocabulary: {
      attackClasses: ATTACK_CLASSES,
      checks: DETERMINISTIC_CHECKS,
      mandatoryChecks: [...MANDATORY_CHECKS],
      advisoryChecks: [...ADVISORY_CHECKS],
    },
  };
});
