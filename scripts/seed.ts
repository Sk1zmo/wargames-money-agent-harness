import { closeDb, currentDriver, getDb, runMigrations } from "../src/db/client";
import { getEnv } from "../src/shared/env";
import { newCorrelationId } from "../src/shared/ids";
import { ensureReferenceAgents, healthCheckAgent } from "../src/agents/registry";
import { generateSuite } from "../src/scenarios/generator";
import { persistSuite } from "../src/scenarios/store";

/**
 * Seeds the harness with everything a fresh install needs:
 *   - the two bundled reference agents (health-checked for real)
 *   - the development suite
 *   - the held-out suite, generated from a DIFFERENT seed
 *
 * Idempotent: re-running reuses existing rows rather than duplicating them.
 */

const HELD_OUT_SEED_OFFSET = 104_729;

async function main(): Promise<void> {
  const env = getEnv();
  const correlationId = newCorrelationId();
  const out = process.stdout;

  await runMigrations();
  const db = await getDb();
  const driver = await currentDriver();

  out.write(`driver=${driver} harnessMode=${env.HARNESS_MODE} seed=${env.SEED}\n\n`);

  const agents = await ensureReferenceAgents(db, correlationId);
  out.write("Reference agents\n");
  for (const agent of agents) {
    const health = await healthCheckAgent(db, agent.id, correlationId);
    out.write(
      `  ${agent.name}@${agent.version} [${agent.id}] healthy=${health.healthy} - ${health.detail}\n`,
    );
  }

  const dev = generateSuite({ split: "development", seed: env.SEED, variantsPerClass: 3 });
  const heldOut = generateSuite({
    split: "held-out",
    // A different seed, not a different label. Held-out scenarios must be
    // distinct instances or a held-out score measures nothing.
    seed: env.SEED + HELD_OUT_SEED_OFFSET,
    variantsPerClass: 3,
  });

  out.write("\nSuites\n");
  for (const suite of [dev, heldOut]) {
    const { suiteId, inserted } = await persistSuite(db, suite);
    out.write(
      `  ${suite.name}@${suite.version} [${suiteId}] split=${suite.split} seed=${suite.seed} scenarios=${inserted}\n`,
    );
  }

  const devIds = new Set(dev.scenarios.map((s) => s.prompt));
  const overlap = heldOut.scenarios.filter((s) => devIds.has(s.prompt)).length;
  out.write(`\nPrompt overlap between development and held-out suites: ${overlap}\n`);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    process.stderr.write(
      `Seed failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
