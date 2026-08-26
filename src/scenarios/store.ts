import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { scenarios as scenariosTable, scenarioSuites } from "../db/schema";
import type { ScenarioRow, ScenarioSuite, SuiteSplit } from "../db/schema";
import { AppError } from "../shared/errors";
import { deterministicId } from "../shared/ids";
import type { SandboxSeedState } from "../simulator/types";
import type { DeterministicCheckName } from "./checks";
import type { GeneratedScenario, GeneratedSuite } from "./generator";

/**
 * Suite persistence.
 *
 * Scenarios are generated deterministically, but they are still WRITTEN to the
 * database rather than regenerated on demand. A certification result must stay
 * interpretable after the generator changes: if a run pointed at code instead
 * of at stored rows, upgrading the generator would silently rewrite the history
 * of what every past agent was actually tested on.
 */

/** How the sandbox seed and fault injection are packed into environment_state. */
interface StoredEnvironment {
  seedState: SandboxSeedState;
  faultInjection?: GeneratedScenario["faultInjection"];
}

export async function persistSuite(
  db: Database,
  suite: GeneratedSuite,
): Promise<{ suiteId: string; inserted: number }> {
  const existing = await db
    .select()
    .from(scenarioSuites)
    .where(eq(scenarioSuites.name, suite.name))
    .limit(50);

  const match = existing.find((s) => s.version === suite.version);
  if (match) {
    const count = await countScenarios(db, match.id);
    return { suiteId: match.id, inserted: count };
  }

  // Deterministic so regenerating the same suite reuses the same id.
  const suiteId = deterministicId("ste", `${suite.name}-${suite.version}`);
  await db.insert(scenarioSuites).values({
    id: suiteId,
    name: suite.name,
    version: suite.version,
    split: suite.split,
    seed: suite.seed,
    description: suite.description,
    scenarioCount: suite.scenarios.length,
    generatorVersion: suite.generatorVersion,
  });

  await db.insert(scenariosTable).values(
    suite.scenarios.map((s) => ({
      id: s.id,
      suiteId,
      attackClass: s.attackClass,
      title: s.title,
      description: s.description,
      riskLevel: s.riskLevel,
      version: s.version,
      seed: s.seed,
      split: s.split,
      environmentState: {
        seedState: s.seedState,
        ...(s.faultInjection ? { faultInjection: s.faultInjection } : {}),
      } satisfies StoredEnvironment,
      authorityState: s.seedState.authority,
      preconditions: s.preconditions,
      prompt: s.prompt,
      expectedSafeBehavior: s.expectedSafeBehavior,
      prohibitedBehavior: s.prohibitedBehavior,
      allowedActions: s.allowedActions,
      prohibitedActions: s.prohibitedActions,
      expectedVerdict: s.expectedVerdict,
      evidenceRequirements: s.evidenceRequirements,
      deterministicChecks: s.deterministicChecks,
    })),
  );

  return { suiteId, inserted: suite.scenarios.length };
}

async function countScenarios(db: Database, suiteId: string): Promise<number> {
  const rows = await db
    .select({ id: scenariosTable.id })
    .from(scenariosTable)
    .where(eq(scenariosTable.suiteId, suiteId));
  return rows.length;
}

/** Rehydrates a stored row into the shape the engine executes. */
export function rowToScenario(row: ScenarioRow): GeneratedScenario {
  const env = row.environmentState as StoredEnvironment;
  if (!env || typeof env !== "object" || !env.seedState) {
    throw new AppError(
      "SCENARIO_NOT_FOUND",
      `Scenario ${row.id} has no stored sandbox seed state and cannot be executed.`,
    );
  }
  return {
    id: row.id,
    attackClass: row.attackClass,
    title: row.title,
    description: row.description,
    riskLevel: row.riskLevel,
    version: row.version,
    seed: row.seed,
    split: row.split,
    prompt: row.prompt,
    seedState: env.seedState,
    preconditions: row.preconditions,
    expectedSafeBehavior: row.expectedSafeBehavior,
    prohibitedBehavior: row.prohibitedBehavior,
    allowedActions: row.allowedActions,
    prohibitedActions: row.prohibitedActions,
    expectedVerdict: row.expectedVerdict,
    evidenceRequirements: row.evidenceRequirements,
    deterministicChecks: row.deterministicChecks as DeterministicCheckName[],
    ...(env.faultInjection ? { faultInjection: env.faultInjection } : {}),
  };
}

export async function loadSuiteScenarios(
  db: Database,
  suiteId: string,
): Promise<GeneratedScenario[]> {
  const rows = await db
    .select()
    .from(scenariosTable)
    .where(eq(scenariosTable.suiteId, suiteId))
    .orderBy(asc(scenariosTable.attackClass), asc(scenariosTable.id));
  return rows.map((r) => rowToScenario(r as ScenarioRow));
}

export async function getSuite(db: Database, suiteId: string): Promise<ScenarioSuite> {
  const [row] = await db
    .select()
    .from(scenarioSuites)
    .where(eq(scenarioSuites.id, suiteId))
    .limit(1);
  if (!row) throw new AppError("SUITE_NOT_FOUND", `No suite with id '${suiteId}'.`);
  return row as ScenarioSuite;
}

export async function listSuites(db: Database, split?: SuiteSplit): Promise<ScenarioSuite[]> {
  const base = db.select().from(scenarioSuites);
  const rows = split ? await base.where(eq(scenarioSuites.split, split)) : await base;
  return rows as ScenarioSuite[];
}
