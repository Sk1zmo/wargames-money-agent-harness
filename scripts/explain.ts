import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { agentResponses, evidence, scenarioExecutions } from "../src/db/schema";
import type { CheckOutcome } from "../src/scenarios/checks";
import type { ToolCallRecord } from "../src/simulator/types";

/**
 * Prints the full evidence trail for one execution, or for every non-PASS
 * execution of a run. Used when investigating why a verdict came out the way
 * it did, rather than assuming.
 *
 * Usage: npx tsx scripts/explain.ts --run <runId> [--class CLASS] [--limit N]
 *        npx tsx scripts/explain.ts --execution <executionId>
 */

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const db = await getDb();
  const out = process.stdout;
  const runId = arg("--run");
  const executionId = arg("--execution");
  const klass = arg("--class");
  const limit = Number(arg("--limit") ?? 3);

  let executions = executionId
    ? await db.select().from(scenarioExecutions).where(eq(scenarioExecutions.id, executionId))
    : runId
      ? await db
          .select()
          .from(scenarioExecutions)
          .where(eq(scenarioExecutions.runId, runId))
          .orderBy(asc(scenarioExecutions.startedAt))
      : [];

  if (executions.length === 0) {
    out.write("No matching executions. Pass --run <runId> or --execution <executionId>.\n");
    return;
  }

  if (!executionId) {
    executions = executions.filter((e) => e.verdict !== "PASS");
    if (klass) executions = executions.filter((e) => e.attackClass === klass);
    executions = executions.slice(0, limit);
  }

  for (const e of executions) {
    out.write(`\n${"=".repeat(78)}\n`);
    out.write(`${e.scenarioId}  [${e.attackClass}]  verdict=${e.verdict}  status=${e.status}\n`);
    out.write(`expected=${e.expectedVerdict}  matched=${e.matchedExpectation}\n`);
    if (e.errorCode) out.write(`error: ${e.errorCode} - ${e.errorDetail}\n`);

    out.write("\n-- checks --\n");
    for (const c of (e.deterministicChecks ?? []) as CheckOutcome[]) {
      out.write(`  ${c.passed ? "PASS" : "FAIL"} ${c.mandatory ? "*" : " "} ${c.check}: ${c.detail}\n`);
    }

    out.write("\n-- reasons --\n");
    for (const r of e.verdictReasons ?? []) out.write(`  ${r}\n`);

    const [resp] = await db
      .select()
      .from(agentResponses)
      .where(eq(agentResponses.executionId, e.id))
      .limit(1);
    if (resp) {
      out.write(
        `\n-- agent reply (refused=${resp.refused} escalated=${resp.escalatedToHuman} claimed=${resp.claimedPaymentState}) --\n`,
      );
      out.write(`  ${resp.responseText.slice(0, 1200)}\n`);
      out.write("\n-- tool calls --\n");
      for (const c of (resp.toolCalls ?? []) as ToolCallRecord[]) {
        out.write(
          `  ${String(c.index).padStart(2)}. ${c.tool} ${JSON.stringify(c.args).slice(0, 140)} -> ${c.outcome}${c.delegatedPolicyViolation ? " [DELEGATED-POLICY VIOLATION]" : ""}\n`,
        );
      }
    }

    const ev = await db.select().from(evidence).where(eq(evidence.executionId, e.id));
    const scenarioInput = ev.find((x) => x.kind === "SCENARIO_INPUT");
    if (scenarioInput) {
      const payload = scenarioInput.payload as { prompt?: string };
      out.write("\n-- prompt --\n");
      out.write(`${(payload.prompt ?? "").split("\n").map((l) => `  ${l}`).join("\n")}\n`);
    }
    out.write(`\n(${ev.length} evidence records)\n`);
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
