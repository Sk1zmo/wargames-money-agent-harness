import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { CircleCheck, CircleX } from "lucide-react";
import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { certificationRuns, scenarioExecutions } from "@/db/schema";
import type { CheckOutcome } from "@/scenarios/checks";
import type { ClassScore } from "@/evaluation/certification";
import { Bar, Empty, Metric, Panel, VerdictChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureBootstrapped();
  const db = await getDb();

  const [run] = await db
    .select()
    .from(certificationRuns)
    .where(eq(certificationRuns.id, id))
    .limit(1);
  if (!run) notFound();

  const executions = await db
    .select()
    .from(scenarioExecutions)
    .where(eq(scenarioExecutions.runId, id))
    .orderBy(asc(scenarioExecutions.startedAt));

  const classScores = (run.classScores as ClassScore[]) ?? [];
  const summary = run.summary as {
    total: number;
    pass: number;
    fail: number;
    conditional: number;
    humanReview: number;
    inconclusive: number;
  } | null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/runs"
          className="deck-label hover:text-[var(--color-phosphor-dim)]"
        >
          ← All certifications
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Certification</h1>
          {run.overallVerdict && <VerdictChip verdict={run.overallVerdict} size="lg" />}
        </div>
        <p className="deck-readout mt-2 text-xs text-[var(--color-phosphor-faint)]">
          {run.agentId} · {run.suiteVersion} · engine {run.engineVersion} · judge {run.judgeModel}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Score"
          value={run.overallScore === null ? "—" : run.overallScore.toFixed(4)}
          tone={run.overallVerdict === "PASS" ? "good" : run.overallVerdict === "FAIL" ? "bad" : "warn"}
          hint="Risk-weighted mean of per-class scores. CRITICAL classes weigh four times a LOW one."
        />
        <Metric
          label="Scenarios"
          value={`${run.scenarioCompleted}/${run.scenarioTotal}`}
          hint={summary ? `${summary.pass} pass · ${summary.fail} fail · ${summary.conditional} conditional` : undefined}
        />
        <Metric label="Duration" value={`${run.durationMs}ms`} />
        <Metric
          label="Mode"
          value={run.harnessMode}
          tone="good"
          hint="Recorded on the run itself, so a stored verdict always carries the environment that produced it."
        />
      </div>

      <Panel
        title="Fingerprint"
        subtitle="Binds every version that shaped this result, so it cannot silently come to mean something else"
      >
        <code className="deck-readout block break-all text-xs text-[var(--color-signal)]">
          {run.fingerprint}
        </code>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          {[
            ["agent version", run.agentVersion],
            ["adapter", run.adapterVersion],
            ["suite", run.suiteVersion],
            ["engine", run.engineVersion],
            ["judge", `${run.judgeMode} · ${run.judgeModel}`],
            ["confidence threshold", run.judgeConfidenceThreshold.toFixed(2)],
            ["seed", String(run.seed)],
            ["repetitions", String(run.repetitions)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-[var(--color-phosphor-faint)]">{k}</dt>
              <dd className="deck-readout text-[var(--color-phosphor-dim)]">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {classScores.length > 0 && (
        <Panel title="Per attack class">
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-deck-line)] text-left">
                  <th className="deck-label px-4 pb-2 font-normal">Class</th>
                  <th className="deck-label px-4 pb-2 font-normal">Risk</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Pass</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Fail</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Score</th>
                  <th className="deck-label px-4 pb-2 font-normal">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {[...classScores]
                  .sort((a, b) => a.attackClass.localeCompare(b.attackClass))
                  .map((c) => (
                    <tr
                      key={c.attackClass}
                      className="border-b border-[var(--color-deck-line)] last:border-0"
                    >
                      <td className="deck-readout px-4 py-2 text-xs">
                        {c.attackClass.replace(/_/g, " ").toLowerCase()}
                      </td>
                      <td className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-faint)]">
                        {c.riskLevel}
                      </td>
                      <td className="deck-readout px-4 py-2 text-right text-xs text-[var(--color-verdict-pass)]">
                        {c.passed}
                      </td>
                      <td className="deck-readout px-4 py-2 text-right text-xs text-[var(--color-verdict-fail)]">
                        {c.failed}
                      </td>
                      <td className="deck-readout px-4 py-2 text-right text-xs">
                        {c.score.toFixed(2)}
                      </td>
                      <td className="w-28 px-4 py-2">
                        <Bar value={c.score} tone={c.score >= 0.99 ? "good" : c.score === 0 ? "bad" : "neutral"} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Executions" subtitle={`${executions.length} scenario execution(s)`}>
        {executions.length === 0 ? (
          <Empty title="No executions" detail="This run recorded no scenario executions." />
        ) : (
          <ul className="space-y-1.5">
            {executions.map((e) => {
              const checks = (e.deterministicChecks as CheckOutcome[]) ?? [];
              const reasons = (e.verdictReasons as string[]) ?? [];
              const failed = checks.filter((c) => !c.passed);
              return (
                <li key={e.id} className="rounded-sm border border-[var(--color-deck-line)]">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 transition hover:bg-[var(--color-deck-raised)]">
                      {e.verdict && <VerdictChip verdict={e.verdict} />}
                      <span className="deck-readout min-w-0 flex-1 truncate text-xs text-[var(--color-phosphor-dim)]">
                        {e.attackClass.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {failed.length > 0 && (
                        <span className="deck-readout text-[0.65rem] text-[var(--color-verdict-fail)]">
                          {failed.length} failed
                        </span>
                      )}
                      <span className="deck-readout text-[0.65rem] text-[var(--color-phosphor-faint)]">
                        {e.totalLatencyMs}ms
                      </span>
                    </summary>

                    <div className="space-y-3 border-t border-[var(--color-deck-line)] px-3 py-2.5">
                      <div>
                        <p className="deck-label mb-1.5">Checks</p>
                        <ul className="space-y-1">
                          {checks.map((c) => (
                            <li key={c.check} className="flex items-start gap-2 text-xs">
                              {c.passed ? (
                                <CircleCheck
                                  size={12}
                                  className="mt-0.5 shrink-0 text-[var(--color-verdict-pass)]"
                                  aria-hidden
                                />
                              ) : (
                                <CircleX
                                  size={12}
                                  className="mt-0.5 shrink-0 text-[var(--color-verdict-fail)]"
                                  aria-hidden
                                />
                              )}
                              <div className="min-w-0">
                                <span className="deck-readout text-[0.7rem] text-[var(--color-phosphor)]">
                                  {c.check}
                                  {c.mandatory && (
                                    <span className="ml-1.5 text-[var(--color-verdict-fail)]">
                                      mandatory
                                    </span>
                                  )}
                                </span>
                                <p className="mt-0.5 leading-relaxed text-[var(--color-phosphor-dim)]">
                                  {c.detail}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="border-t border-[var(--color-deck-line)] pt-2.5">
                        <p className="deck-label mb-1">
                          Why this verdict · {e.errorCode ?? "no fault"}
                        </p>
                        <ul className="space-y-0.5">
                          {reasons.map((r, i) => (
                            <li
                              key={i}
                              className="text-xs leading-relaxed text-[var(--color-phosphor-dim)]"
                            >
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
