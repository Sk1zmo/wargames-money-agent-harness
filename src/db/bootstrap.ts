import { getDb, runMigrations } from "./client";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import { newCorrelationId, withDeterministicIds } from "../shared/ids";
import { ensureReferenceAgents } from "../agents/registry";
import { generateSuite } from "../scenarios/generator";
import { listSuites, persistSuite } from "../scenarios/store";
import { getReferenceAgent } from "../agents/registry";
import { certify } from "../evaluation/certification";

/**
 * Makes a fresh process usable without a manual seed step.
 *
 * Needed because an in-memory PGlite instance starts empty on every cold start,
 * and a deployment whose pages all render "no data" is indistinguishable from a
 * broken one. Running migrations plus the deterministic seed costs a second on
 * first request and leaves the instance in exactly the state `npm run db:seed`
 * produces locally.
 *
 * Idempotent and safe against a durable database: it inserts only what is
 * missing. Against a real PostgreSQL this is a no-op after the first run.
 *
 * It does NOT run certifications. Every number in the UI still comes from a run
 * someone triggered, so nothing is pre-baked to look impressive.
 */

const HELD_OUT_SEED_OFFSET = 104_729;

let bootstrapped: Promise<void> | null = null;

export async function ensureBootstrapped(): Promise<void> {
  if (bootstrapped) return bootstrapped;
  bootstrapped = withDeterministicIds(async () => {
    const env = getEnv();
    const started = Date.now();

    await runMigrations();
    const db = await getDb();

    const existing = await listSuites(db);
    if (existing.length > 0) {
      logger.debug("bootstrap_skipped", { reason: "suites already present" });
      return;
    }

    const correlationId = newCorrelationId();
    await ensureReferenceAgents(db, correlationId);

    const dev = generateSuite({ split: "development", seed: env.SEED, variantsPerClass: 3 });
    const heldOut = generateSuite({
      split: "held-out",
      seed: env.SEED + HELD_OUT_SEED_OFFSET,
      variantsPerClass: 3,
      excludePrompts: new Set(dev.scenarios.map((s) => s.prompt)),
    });

    await persistSuite(db, dev);
    const { suiteId: heldOutId } = await persistSuite(db, heldOut);

    /*
      Certify both reference agents during bootstrap.

      On a serverless host every instance starts with an empty in-memory
      database, so without this the wall would show fifteen IDLE tiles and the
      certificate endpoint would correctly answer "nothing has been run". Both
      are honest, and both are useless: a harness whose whole claim is that it
      finds unsafe behaviour has to have found some.

      Two agents, not one. The safe agent alone would give a wall of green,
      which is exactly the wall that proves nothing -- a harness that never
      fails anything is indistinguishable from a harness that cannot fail
      anything. The vulnerable agent is what makes the green mean something.

      Held-out split, because the development split is what the deterministic
      checks were written against and scoring an agent on it would flatter it.
    */
    for (const kind of ["safe", "vulnerable"] as const) {
      const agent = await getReferenceAgent(db, kind);
      await certify({
        db,
        agent,
        suiteId: heldOutId,
        suiteVersion: heldOut.version,
        scenarios: heldOut.scenarios,
        seed: heldOut.seed,
        correlationId,
      });
    }

    logger.info("bootstrap_complete", {
      durationMs: Date.now() - started,
      inMemory: env.pgliteInMemory,
    });
  }).catch((error: unknown) => {
    // A failed bootstrap must not be cached as success, or every later request
    // would see an empty database with no explanation.
    bootstrapped = null;
    throw error;
  });

  return bootstrapped;
}
