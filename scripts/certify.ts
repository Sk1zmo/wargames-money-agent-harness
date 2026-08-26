import { closeDb, getDb } from "../src/db/client";
import { getEnv } from "../src/shared/env";
import { getAgent, getReferenceAgent, listAgents } from "../src/agents/registry";
import { listSuites, loadSuiteScenarios } from "../src/scenarios/store";
import { certify, type CertificationResult } from "../src/evaluation/certification";
import type { SuiteSplit } from "../src/db/schema";

/**
 * Runs a real certification and prints the real result.
 *
 * Usage:
 *   npm run certify -- --agent <agentId|safe|vulnerable> [--split held-out]
 *                      [--repetitions N] [--limit N]
 *
 * Nothing here decides an outcome in advance. The numbers printed are whatever
 * the engine produced from executing the suite.
 */

interface Args {
  agent: string;
  split: SuiteSplit;
  repetitions: number;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const limit = get("--limit");
  return {
    agent: get("--agent") ?? "vulnerable",
    split: (get("--split") as SuiteSplit) ?? "held-out",
    repetitions: Number(get("--repetitions") ?? 1),
    ...(limit ? { limit: Number(limit) } : {}),
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

export function printResult(result: CertificationResult, agentLabel: string): void {
  const out = process.stdout;
  out.write(`\n=== ${agentLabel} ===\n`);
  out.write(`run:      ${result.runId}\n`);
  out.write(`verdict:  ${result.overallVerdict}\n`);
  out.write(`score:    ${result.overallScore.toFixed(4)} (risk-weighted mean of class scores)\n`);
  out.write(`duration: ${result.durationMs}ms over ${result.summary.total} execution(s)\n`);
  const s = result.summary;
  out.write(
    `outcomes: PASS=${s.pass} FAIL=${s.fail} CONDITIONAL=${s.conditional} HUMAN_REVIEW=${s.humanReview} INCONCLUSIVE=${s.inconclusive}\n`,
  );

  out.write("\n  class                          n   pass fail cond hrev inc  score  risk\n");
  for (const c of [...result.classScores].sort((a, b) => a.attackClass.localeCompare(b.attackClass))) {
    out.write(
      `  ${c.attackClass.padEnd(29)}${String(c.total).padStart(2)}   ` +
        `${String(c.passed).padStart(3)} ${String(c.failed).padStart(4)} ${String(c.conditional).padStart(4)} ` +
        `${String(c.humanReview).padStart(4)} ${String(c.inconclusive).padStart(3)}  ${c.score.toFixed(2)}  ${c.riskLevel}\n`,
    );
  }

  const matched = result.executions.filter((e) => e.matchedExpectation).length;
  out.write(
    `\n  scenarios where the observed verdict equalled the scenario's expected verdict: ${matched}/${result.executions.length} (${pct(matched, result.executions.length)})\n`,
  );

  const rules = new Map<string, number>();
  for (const e of result.executions) rules.set(e.decidingRule, (rules.get(e.decidingRule) ?? 0) + 1);
  out.write("  deciding rules: ");
  out.write([...rules.entries()].map(([r, n]) => `${r}=${n}`).join(", "));
  out.write("\n");
}

async function resolveAgentId(db: Awaited<ReturnType<typeof getDb>>, token: string) {
  if (token === "safe" || token === "vulnerable") return getReferenceAgent(db, token);
  return getAgent(db, token);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnv();
  const db = await getDb();
  const out = process.stdout;

  const agents = await listAgents(db);
  if (agents.length === 0) {
    out.write("No agents registered. Run `npm run db:seed` first.\n");
    return;
  }

  const agent = await resolveAgentId(db, args.agent);
  const suites = await listSuites(db, args.split);
  const suite = suites[0];
  if (!suite) {
    out.write(`No '${args.split}' suite found. Run \`npm run db:seed\` first.\n`);
    return;
  }

  let scenarios = await loadSuiteScenarios(db, suite.id);
  if (args.limit) scenarios = scenarios.slice(0, args.limit);

  out.write(
    `Certifying ${agent.name}@${agent.version} against ${suite.name}@${suite.version} ` +
      `(${scenarios.length} scenario(s), ${args.repetitions} repetition(s), judge=${env.modelJudgeEnabled ? env.LLM_MODEL : "rubric"}).\n`,
  );

  const result = await certify({
    db,
    agent,
    suiteId: suite.id,
    suiteVersion: suite.version,
    scenarios,
    seed: suite.seed,
    repetitions: args.repetitions,
  });

  printResult(result, `${agent.name}@${agent.version} / ${suite.split}`);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    process.stderr.write(
      `Certification failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
