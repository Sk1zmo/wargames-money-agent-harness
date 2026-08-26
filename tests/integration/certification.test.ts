import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, type Database } from "@/db/client";
import { scenarioExecutions } from "@/db/schema";
import { ensureReferenceAgents, getReferenceAgent, registerAgent } from "@/agents/registry";
import { generateSuite, ALL_CLASSES } from "@/scenarios/generator";
import { persistSuite, loadSuiteScenarios } from "@/scenarios/store";
import { certify } from "@/evaluation/certification";
import { runSelfEvaluation } from "@/scoring/self-evaluation";
import { decideReview, listReviews } from "@/reviews/service";
import { queryAudit } from "@/audit/service";
import { newCorrelationId } from "@/shared/ids";
import { AppError } from "@/shared/errors";

/**
 * End-to-end, against a real PostgreSQL (PGlite, in-memory).
 *
 * This exercises the path a third party would use: register, generate a suite,
 * certify, evaluate, review. The assertions are about behaviour that must hold
 * for ANY agent, not about the specific numbers the reference agents produce,
 * because pinning those would make every future scenario change a test failure
 * rather than a signal.
 */

let db: Database;
let close: () => Promise<void>;
let suiteId: string;
const correlationId = newCorrelationId();

beforeAll(async () => {
  const handle = await createTestDatabase();
  db = handle.db;
  close = handle.close;

  await ensureReferenceAgents(db, correlationId);
  const suite = generateSuite({ split: "development", seed: 991, variantsPerClass: 1 });
  ({ suiteId } = await persistSuite(db, suite));
});

afterAll(async () => {
  await close();
});

describe("scenario generation", () => {
  it("covers every attack class", () => {
    const suite = generateSuite({ split: "development", seed: 7, variantsPerClass: 1 });
    const classes = new Set(suite.scenarios.map((s) => s.attackClass));
    expect(classes.size).toBe(ALL_CLASSES.length);
  });

  it("is deterministic for a given seed", () => {
    const a = generateSuite({ split: "development", seed: 12345, variantsPerClass: 2 });
    const b = generateSuite({ split: "development", seed: 12345, variantsPerClass: 2 });
    expect(a.scenarios.map((s) => s.prompt)).toEqual(b.scenarios.map((s) => s.prompt));
  });

  it("held-out shares no prompt with development, across many seeds", () => {
    // If the splits overlapped, a held-out score would measure memorisation of
    // fixtures rather than generalisation.
    //
    // Swept over several seeds deliberately. An earlier version checked a
    // single seed, passed, and hid a real collision: two builders drew their
    // prompts from a space small enough that the two splits landed on the same
    // text at other seeds. One seed proves nothing about a sampling process.
    const collisions: string[] = [];
    for (const seed of [1, 555, 4242, 70_240_811, 99_999_999]) {
      const dev = generateSuite({ split: "development", seed, variantsPerClass: 3 });
      const devPrompts = new Set(dev.scenarios.map((s) => s.prompt));
      const held = generateSuite({
        split: "held-out",
        seed: seed + 104_729,
        variantsPerClass: 3,
        excludePrompts: devPrompts,
      });
      for (const s of held.scenarios) {
        if (devPrompts.has(s.prompt)) collisions.push(`seed ${seed}: ${s.attackClass}`);
      }
      // Within a suite too: two variants of one class must not be identical.
      const within = held.scenarios.map((s) => s.prompt);
      expect(new Set(within).size).toBe(within.length);
    }
    expect(collisions).toEqual([]);
  });

  it("includes a benign control, so refuse-everything cannot win", () => {
    const suite = generateSuite({ split: "development", seed: 3, variantsPerClass: 1 });
    expect(suite.scenarios.some((s) => s.attackClass === "BENIGN_CONTROL")).toBe(true);
  });

  it("round-trips through the database unchanged", async () => {
    const stored = await loadSuiteScenarios(db, suiteId);
    expect(stored.length).toBe(ALL_CLASSES.length);
    for (const s of stored) {
      expect(s.seedState.authority.authorityId).toBeTruthy();
      expect(s.deterministicChecks).toBeInstanceOf(Array);
    }
  });
});

describe("certification", () => {
  it("separates the safe agent from the vulnerable one", async () => {
    const scenarios = await loadSuiteScenarios(db, suiteId);

    const safe = await certify({
      db,
      agent: await getReferenceAgent(db, "safe"),
      suiteId,
      suiteVersion: "1.0.0",
      scenarios,
      seed: 991,
      correlationId,
    });

    const vulnerable = await certify({
      db,
      agent: await getReferenceAgent(db, "vulnerable"),
      suiteId,
      suiteVersion: "1.0.0",
      scenarios,
      seed: 991,
      correlationId,
    });

    // The instrument is only useful if it tells them apart at all.
    expect(safe.overallScore).toBeGreaterThan(vulnerable.overallScore);
    expect(vulnerable.overallVerdict).toBe("FAIL");
  });

  it("persists an execution row per scenario with its reasoning", async () => {
    const scenarios = await loadSuiteScenarios(db, suiteId);
    const run = await certify({
      db,
      agent: await getReferenceAgent(db, "vulnerable"),
      suiteId,
      suiteVersion: "1.0.0",
      scenarios: scenarios.slice(0, 3),
      seed: 991,
      correlationId,
    });

    const rows = await db
      .select()
      .from(scenarioExecutions)
      .where(eq(scenarioExecutions.runId, run.runId));

    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.verdict).toBeTruthy();
      // A verdict with no stated reason is not auditable.
      expect((row.verdictReasons as string[]).length).toBeGreaterThan(0);
    }
  });

  it("a single failed scenario fails the whole certification", async () => {
    // Averaging a disqualifying failure away behind passes would defeat the
    // purpose of an instrument that gates financial authority.
    const scenarios = await loadSuiteScenarios(db, suiteId);
    const run = await certify({
      db,
      agent: await getReferenceAgent(db, "vulnerable"),
      suiteId,
      suiteVersion: "1.0.0",
      scenarios,
      seed: 991,
      correlationId,
    });
    expect(run.summary.fail).toBeGreaterThan(0);
    expect(run.overallVerdict).toBe("FAIL");
  });

  it("writes an audit event for every execution", async () => {
    const events = await queryAudit(db, { action: "SCENARIO_EXECUTED", limit: 500 });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events.slice(0, 5)) {
      expect(e.correlationId).toBeTruthy();
      expect(e.objectType).toBe("scenario_execution");
    }
  });
});

describe("self-evaluation", () => {
  it("computes real detection and false-alarm rates", async () => {
    const result = await runSelfEvaluation({ db, suiteId, correlationId });

    expect(result.detection.rate).toBeGreaterThanOrEqual(0);
    expect(result.detection.rate).toBeLessThanOrEqual(1);
    expect(result.falseAlarm.rate).toBeGreaterThanOrEqual(0);
    expect(result.falseAlarm.rate).toBeLessThanOrEqual(1);

    // The benign control is excluded from detection: there is no attack there,
    // so counting it would inflate the rate with a class that measures nothing.
    expect(result.detection.adversarialScenarios).toBe(result.scenarios - 1);

    expect(result.separation.separated).toBe(true);
  });

  it("reports judge consistency as not meaningful under the deterministic rubric", async () => {
    const result = await runSelfEvaluation({ db, suiteId, correlationId });
    // A pure function agreeing with itself is a tautology, not evidence.
    expect(result.judgeConsistency.meaningful).toBe(false);
    expect(result.judgeConsistency.agreement).toBeNull();
  });
});

describe("human review", () => {
  it("records a decision without overwriting the machine verdict", async () => {
    const reviews = await listReviews(db, { status: "PENDING" });
    if (reviews.length === 0) {
      // Nothing to review is a legitimate state with these agents; assert that
      // rather than silently passing an empty test.
      expect(reviews).toEqual([]);
      return;
    }

    const review = reviews[0]!;
    const machineVerdict = review.machineVerdict;

    const decided = await decideReview(db, {
      reviewId: review.id,
      decision: "APPROVED",
      reviewerId: "tester",
      rationale: "Reviewed the evidence and agree with the machine assessment.",
      correlationId,
    });

    expect(decided.status).toBe("APPROVED");
    expect(decided.machineVerdict).toBe(machineVerdict);

    const [execution] = await db
      .select()
      .from(scenarioExecutions)
      .where(eq(scenarioExecutions.id, review.executionId))
      .limit(1);
    // The stored verdict is what the harness concluded, permanently.
    expect(execution?.verdict).toBe(machineVerdict);
  });

  it("refuses a decision with no rationale", async () => {
    const reviews = await listReviews(db, { status: "PENDING" });
    if (reviews.length === 0) return;

    await expect(
      decideReview(db, {
        reviewId: reviews[0]!.id,
        decision: "APPROVED",
        reviewerId: "tester",
        rationale: "ok",
        correlationId,
      }),
    ).rejects.toThrow(AppError);
  });
});

describe("registration refuses inline credentials", () => {
  it("rejects an adapter config carrying a token", async () => {
    await expect(
      registerAgent(db, {
        name: "leaky-agent",
        version: "1.0.0",
        adapterType: "http",
        adapterConfig: { endpoint: "http://127.0.0.1:9000", apiKey: "sk-live-secret" },
        correlationId,
      }),
    ).rejects.toThrow(/credential/i);
  });

  it("accepts the NAME of an environment variable instead", async () => {
    const agent = await registerAgent(db, {
      name: "tidy-agent",
      version: "1.0.0",
      adapterType: "http",
      adapterConfig: { endpoint: "http://127.0.0.1:9000", authTokenEnvVar: "MY_TOKEN" },
      correlationId,
    });
    expect(agent.adapterConfig.authTokenEnvVar).toBe("MY_TOKEN");
    expect(JSON.stringify(agent.adapterConfig)).not.toContain("sk-");
  });

  it("refuses a duplicate name and version rather than mutating a certified agent", async () => {
    await expect(
      registerAgent(db, {
        name: "tidy-agent",
        version: "1.0.0",
        adapterType: "http",
        adapterConfig: { endpoint: "http://127.0.0.1:9000" },
        correlationId,
      }),
    ).rejects.toThrow(/already registered/i);
  });
});
