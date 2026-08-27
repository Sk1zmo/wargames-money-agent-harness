import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { ATTACK_CLASSES, certificationRuns, scenarioExecutions, targetAgents } from "@/db/schema";
import { CERTIFICATE_VERSION, toMarkdown, type CertificateInput } from "@/export/certificate";
import { environmentStatus } from "@/shared/env";

export const dynamic = "force-dynamic";

/**
 * Downloads a certification report.
 *
 * `id` may be `latest`, because the thing a reader usually wants is the most
 * recent run and making them look up an identifier first is friction with no
 * purpose.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await ensureBootstrapped();
  const db = await getDb();
  const { id } = await context.params;

  const [run] =
    id === "latest"
      ? await db.select().from(certificationRuns).orderBy(desc(certificationRuns.createdAt)).limit(1)
      : await db.select().from(certificationRuns).where(eq(certificationRuns.id, id));

  if (!run) {
    return NextResponse.json(
      {
        error: "RUN_NOT_FOUND",
        message:
          id === "latest"
            ? "No certification run has been recorded on this instance. Run one first — a report with no executions behind it would certify nothing."
            : `No certification run ${id}.`,
      },
      { status: 404 },
    );
  }

  const executions = await db
    .select()
    .from(scenarioExecutions)
    .where(eq(scenarioExecutions.runId, run.id));

  const [agent] = await db.select().from(targetAgents).where(eq(targetAgents.id, run.agentId));
  const env = environmentStatus();

  const input: CertificateInput = {
    run: {
      id: run.id,
      agentId: run.agentId,
      agentName: agent?.name ?? run.agentId,
      agentVersion: run.agentVersion,
      suiteId: run.suiteId,
      suiteVersion: run.suiteVersion,
      verdict: run.overallVerdict ?? "INCONCLUSIVE",
      createdAt: run.createdAt.toISOString(),
      fingerprint: run.fingerprint ?? null,
    },
    executions: executions.map((e) => ({
      scenarioId: e.scenarioId,
      attackClass: e.attackClass,
      verdict: e.verdict,
      // The suite carries risk on the SCENARIO, not the execution, and the
      // per-execution narrative lives in verdictReasons. Reading the columns
      // that exist rather than inventing two that sound plausible.
      riskLevel: e.expectedVerdict ?? null,
      summary: Array.isArray(e.verdictReasons) && e.verdictReasons.length > 0
        ? (e.verdictReasons as string[]).join(" ")
        : (e.errorDetail ?? null),
      totalLatencyMs: e.totalLatencyMs,
    })),
    allAttackClasses: ATTACK_CLASSES,
    environment: {
      harnessMode: env.harnessMode,
      moneyReachable: false,
      modelProvider: env.judge.provider,
      modelName: env.judge.model,
    },
    generatedAt: new Date().toISOString(),
  };

  return new NextResponse(toMarkdown(input), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="certification-${run.id}.md"`,
      "cache-control": "no-store",
      "x-certificate-version": CERTIFICATE_VERSION,
    },
  });
}
