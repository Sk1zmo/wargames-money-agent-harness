import { closeDb, getDb } from "../src/db/client";
import { listSuites } from "../src/scenarios/store";
import { runSelfEvaluation, type SelfEvaluationResult } from "../src/scoring/self-evaluation";
import type { SuiteSplit } from "../src/db/schema";

/**
 * Measures the harness against its own two reference agents and prints the
 * result. Every figure below is computed from executions performed during this
 * command; none of it is stored, assumed, or carried over from a prior run.
 *
 * Usage: npm run selfeval -- [--split held-out]
 */

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function printSelfEvaluation(r: SelfEvaluationResult): void {
  const out = process.stdout;

  out.write(`\n${"=".repeat(78)}\n`);
  out.write(`HARNESS SELF-EVALUATION  (${r.suiteSplit} suite, judge=${r.judgeModel})\n`);
  out.write(`${"=".repeat(78)}\n\n`);

  out.write(`DETECTION RATE   ${pct(r.detection.rate)}  `);
  out.write(`(${r.detection.detected}/${r.detection.adversarialScenarios} adversarial scenarios failed the vulnerable agent)\n`);
  out.write(`  A miss here is an unsafe agent that would have been certified.\n`);
  if (r.detection.missed > 0) {
    out.write(`  Missed:\n`);
    for (const m of r.detection.missedScenarios.slice(0, 12)) {
      out.write(`    ${m.attackClass.padEnd(30)} ${m.scenarioId} -> ${m.verdict}\n`);
    }
  }

  out.write(`\nFALSE-ALARM RATE ${pct(r.falseAlarm.rate)}  `);
  out.write(`(${r.falseAlarm.failed}/${r.falseAlarm.scenarios} scenarios wrongly failed the safe agent)\n`);
  out.write(`  Every one of these is a defect in the harness, not in the agent.\n`);
  out.write(`  Downgraded short of PASS without failing: ${r.falseAlarm.downgraded} (${pct(r.falseAlarm.downgradeRate)})\n`);
  if (r.falseAlarm.offendingScenarios.length > 0) {
    for (const o of r.falseAlarm.offendingScenarios.slice(0, 12)) {
      out.write(`    ${o.attackClass.padEnd(30)} ${o.verdict.padEnd(13)} ${o.reason.slice(0, 90)}\n`);
    }
  }

  out.write(`\nSEPARATION       ${r.separation.separated ? "YES" : "NO"}\n`);
  out.write(
    `  safe=${r.separation.safeVerdict} (${r.separation.safeScore.toFixed(4)})  ` +
      `vulnerable=${r.separation.vulnerableVerdict} (${r.separation.vulnerableScore.toFixed(4)})  ` +
      `gap=${r.separation.scoreGap.toFixed(4)}\n`,
  );
  out.write(`  A harness that cannot tell these two apart is not measuring anything.\n`);

  out.write(`\nJUDGE CONSISTENCY\n`);
  out.write(
    `  ${r.judgeConsistency.meaningful ? `${pct(r.judgeConsistency.agreement ?? 0)} over ${r.judgeConsistency.repeats} repeats` : "not applicable"}\n`,
  );
  out.write(`  ${r.judgeConsistency.explanation}\n`);

  out.write(`\nPER-CLASS\n`);
  out.write(`  class                          n   detected  falseAlarm  downgraded\n`);
  for (const c of [...r.byClass].sort((a, b) => a.attackClass.localeCompare(b.attackClass))) {
    out.write(
      `  ${c.attackClass.padEnd(29)}${String(c.total).padStart(2)}   ` +
        `${(c.detectionRate === null ? "n/a" : pct(c.detectionRate)).padStart(8)}  ` +
        `${pct(c.falseAlarmRate).padStart(10)}  ` +
        `${String(c.safeDowngraded).padStart(10)}\n`,
    );
  }

  out.write(`\nLATENCY  p50=${r.latency.p50}ms  p95=${r.latency.p95}ms  max=${r.latency.max}ms\n`);
  out.write(`TOTAL    ${r.durationMs}ms over ${r.scenarios * 2} executions\n`);

  out.write(`\nWHAT THIS DOES NOT ESTABLISH\n`);
  out.write(
    `  The reference agents and the checks share an author, so these are\n` +
      `  internal-consistency figures, not external validity. They bound the\n` +
      `  harness on behaviours it was built to see. They do not show that the\n` +
      `  fifteen classes cover every way a payment agent can be unsafe.\n`,
  );
}

async function main(): Promise<void> {
  const split = (arg("--split") as SuiteSplit) ?? "held-out";
  const db = await getDb();
  const suites = await listSuites(db, split);
  const suite = suites[0];
  if (!suite) {
    process.stdout.write(`No '${split}' suite found. Run \`npm run db:seed\` first.\n`);
    return;
  }

  process.stdout.write(
    `Running both reference agents against ${suite.name}@${suite.version} (${suite.scenarioCount} scenarios each)...\n`,
  );
  const result = await runSelfEvaluation({ db, suiteId: suite.id });
  printSelfEvaluation(result);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    process.stderr.write(
      `Self-evaluation failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
