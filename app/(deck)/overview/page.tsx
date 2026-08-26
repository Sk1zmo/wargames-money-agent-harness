import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { getDb, runMigrations } from "@/db/client";
import { certificationRuns, evaluationRuns, scenarioExecutions } from "@/db/schema";
import type { Verdict } from "@/db/schema";
import { Empty, Metric, Panel, VerdictChip } from "@/ui/primitives";
import type { SelfEvaluationResult } from "@/scoring/self-evaluation";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function OverviewPage() {
  await runMigrations();
  const db = await getDb();

  const runs = await db
    .select()
    .from(certificationRuns)
    .orderBy(desc(certificationRuns.createdAt))
    .limit(8);

  const [latestEval] = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(1);

  const executions = await db.select().from(scenarioExecutions).limit(5000);

  const metrics = latestEval?.metrics as SelfEvaluationResult | undefined;

  const verdictCounts = executions.reduce<Record<string, number>>((acc, e) => {
    if (e.verdict) acc[e.verdict] = (acc[e.verdict] ?? 0) + 1;
    return acc;
  }, {});

  const latencies = executions
    .map((e) => e.totalLatencyMs)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] ?? 0 : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-phosphor-dim)]">
          Every figure on this page is computed from executions stored in this database. Nothing is
          seeded, cached from a previous build, or written by hand.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Instrument accuracy                                              */}
      {/* ---------------------------------------------------------------- */}
      {metrics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Detection rate"
              value={pct(metrics.detection.rate)}
              tone={metrics.detection.rate >= 0.9 ? "good" : "warn"}
              hint={`${metrics.detection.detected}/${metrics.detection.adversarialScenarios} adversarial scenarios caught the known-unsafe agent. A miss is an unsafe agent certified.`}
            />
            <Metric
              label="False-alarm rate"
              value={pct(metrics.falseAlarm.rate)}
              tone={metrics.falseAlarm.rate === 0 ? "good" : "bad"}
              hint={`${metrics.falseAlarm.failed}/${metrics.falseAlarm.scenarios} scenarios wrongly failed the known-safe agent. Each one is a defect in the harness, not the agent.`}
            />
            <Metric
              label="Separation"
              value={metrics.separation.scoreGap.toFixed(3)}
              tone={metrics.separation.separated ? "good" : "bad"}
              hint={`Score gap between the safe (${metrics.separation.safeScore.toFixed(2)}) and vulnerable (${metrics.separation.vulnerableScore.toFixed(2)}) reference agents. An instrument that cannot tell them apart measures nothing.`}
            />
            <Metric
              label="Execution p95"
              value={`${p95}ms`}
              hint={`Across ${executions.length} stored executions. The judge is deterministic here; a model judge would dominate this number.`}
            />
          </div>

          <Panel
            title="What these numbers do not establish"
            subtitle={`Measured on the ${metrics.suiteSplit} suite with the ${metrics.judgeModel} judge`}
          >
            <p className="text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              The reference agents and the checks share an author, so these are internal-consistency
              figures rather than external validity. They bound the instrument on behaviours it was
              built to see. They do not establish that fifteen attack classes cover every way a
              payment agent can be unsafe — a third party&rsquo;s agent failing in a way no class
              models would pass, and these figures would not reveal it.
            </p>
            {metrics.judgeConsistency.explanation && (
              <p className="mt-3 border-t border-[var(--color-deck-line)] pt-3 text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
                <span className="deck-label">Judge consistency · </span>
                {metrics.judgeConsistency.explanation}
              </p>
            )}
          </Panel>
        </>
      ) : (
        <Panel title="Instrument accuracy">
          <Empty
            title="The harness has not yet measured itself"
            detail="Detection and false-alarm rates come from running both bundled reference agents over a suite. Until that has happened there is nothing honest to display here."
            command="npm run selfeval"
          />
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Verdict distribution                                             */}
      {/* ---------------------------------------------------------------- */}
      <Panel title="Verdict distribution" subtitle={`${executions.length} stored execution(s)`}>
        {executions.length === 0 ? (
          <Empty
            title="No executions recorded"
            detail="Certify an agent, or run one of the demo scenarios, to populate this."
            command="npm run certify -- --agent vulnerable"
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(
              ["PASS", "FAIL", "CONDITIONAL", "HUMAN_REVIEW", "INCONCLUSIVE"] as Verdict[]
            ).map((v) => (
              <div key={v} className="rounded-sm border border-[var(--color-deck-line)] px-3 py-3">
                <VerdictChip verdict={v} />
                <p className="deck-readout mt-2 text-xl font-semibold">{verdictCounts[v] ?? 0}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Recent certifications                                            */}
      {/* ---------------------------------------------------------------- */}
      <Panel
        title="Recent certifications"
        action={
          <Link
            href="/runs"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-signal)] hover:underline"
          >
            All runs <ArrowRight size={12} aria-hidden />
          </Link>
        }
      >
        {runs.length === 0 ? (
          <Empty
            title="No certification runs yet"
            detail="A run executes a whole suite against one target and produces a verdict per scenario."
            command="npm run certify -- --agent safe --split held-out"
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-deck-line)] text-left">
                  <th className="deck-label px-4 pb-2 font-normal">Target</th>
                  <th className="deck-label px-4 pb-2 font-normal">Suite</th>
                  <th className="deck-label px-4 pb-2 font-normal">Verdict</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Score</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Scenarios</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-deck-line)] last:border-0 hover:bg-[var(--color-deck-raised)]"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/runs/${r.id}`} className="hover:text-[var(--color-signal)]">
                        <span className="deck-readout text-xs">{r.agentVersion}</span>
                        <span className="ml-2 text-[var(--color-phosphor-faint)]">{r.suiteVersion}</span>
                      </Link>
                    </td>
                    <td className="deck-readout px-4 py-2.5 text-xs text-[var(--color-phosphor-dim)]">
                      {r.judgeMode}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.overallVerdict ? (
                        <VerdictChip verdict={r.overallVerdict} />
                      ) : (
                        <span className="deck-readout text-xs text-[var(--color-phosphor-faint)]">
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td className="deck-readout px-4 py-2.5 text-right text-xs">
                      {r.overallScore === null ? "—" : r.overallScore.toFixed(4)}
                    </td>
                    <td className="deck-readout px-4 py-2.5 text-right text-xs text-[var(--color-phosphor-dim)]">
                      {r.scenarioCompleted}/{r.scenarioTotal}
                    </td>
                    <td className="deck-readout px-4 py-2.5 text-right text-xs text-[var(--color-phosphor-dim)]">
                      {r.durationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
