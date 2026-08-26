import { desc } from "drizzle-orm";
import { getDb, runMigrations } from "@/db/client";
import { evaluationRuns } from "@/db/schema";
import { Bar, Empty, Metric, Panel } from "@/ui/primitives";
import type { SelfEvaluationResult } from "@/scoring/self-evaluation";
import { SelfEvalRunner } from "@/ui/self-eval-runner";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function SelfEvaluationPage() {
  await runMigrations();
  const db = await getDb();

  const history = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(10);

  const latest = history[0];
  const m = latest?.metrics as SelfEvaluationResult | undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Self-evaluation</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          A certification harness that has never been tested against a known-unsafe agent and a
          known-safe agent is an untested instrument: it would produce confident verdicts with no
          evidence that those verdicts track anything. Running both bundled reference agents over a
          suite yields the two error rates that bound it.
        </p>
      </div>

      <SelfEvalRunner />

      {m ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Detection rate"
              value={pct(m.detection.rate)}
              tone={m.detection.rate >= 0.9 ? "good" : "warn"}
              hint={`${m.detection.detected} of ${m.detection.adversarialScenarios} adversarial scenarios failed the known-unsafe agent. A miss is a false negative: an unsafe agent certified. This is the expensive error.`}
            />
            <Metric
              label="False-alarm rate"
              value={pct(m.falseAlarm.rate)}
              tone={m.falseAlarm.rate === 0 ? "good" : "bad"}
              hint={`${m.falseAlarm.failed} of ${m.falseAlarm.scenarios} scenarios failed the known-safe agent. Every one is a defect in the harness. This number is what stops the checks being tuned into a machine that fails everything and calls itself rigorous.`}
            />
          </div>

          {m.detection.missedScenarios.length > 0 && (
            <Panel title="Missed detections" subtitle="Adversarial scenarios the harness did not fail">
              <ul className="space-y-1.5">
                {m.detection.missedScenarios.map((s) => (
                  <li key={s.scenarioId} className="deck-readout text-xs">
                    <span className="text-[var(--color-verdict-conditional)]">{s.attackClass}</span>
                    <span className="ml-2 text-[var(--color-phosphor-faint)]">{s.scenarioId}</span>
                    <span className="ml-2 text-[var(--color-phosphor-dim)]">→ {s.verdict}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {m.falseAlarm.offendingScenarios.length > 0 && (
            <Panel
              title="False alarms"
              subtitle="Scenarios where the safe agent was penalised — candidate harness defects"
              alerting
            >
              <ul className="space-y-2">
                {m.falseAlarm.offendingScenarios.map((s) => (
                  <li key={s.scenarioId} className="text-xs">
                    <span className="deck-readout text-[var(--color-verdict-fail)]">
                      {s.attackClass}
                    </span>
                    <span className="deck-readout ml-2 text-[var(--color-phosphor-faint)]">
                      {s.verdict}
                    </span>
                    <p className="mt-0.5 leading-relaxed text-[var(--color-phosphor-dim)]">
                      {s.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Per attack class">
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-deck-line)] text-left">
                    <th className="deck-label px-4 pb-2 font-normal">Class</th>
                    <th className="deck-label px-4 pb-2 text-right font-normal">n</th>
                    <th className="deck-label px-4 pb-2 text-right font-normal">Detected</th>
                    <th className="deck-label px-4 pb-2 font-normal">&nbsp;</th>
                    <th className="deck-label px-4 pb-2 text-right font-normal">False alarm</th>
                  </tr>
                </thead>
                <tbody>
                  {[...m.byClass]
                    .sort((a, b) => a.attackClass.localeCompare(b.attackClass))
                    .map((c) => (
                      <tr
                        key={c.attackClass}
                        className="border-b border-[var(--color-deck-line)] last:border-0"
                      >
                        <td className="deck-readout px-4 py-2 text-xs">
                          {c.attackClass.replace(/_/g, " ").toLowerCase()}
                        </td>
                        <td className="deck-readout px-4 py-2 text-right text-xs text-[var(--color-phosphor-dim)]">
                          {c.total}
                        </td>
                        <td className="deck-readout px-4 py-2 text-right text-xs">
                          {c.detectionRate === null ? (
                            <span
                              className="text-[var(--color-phosphor-faint)]"
                              title="Benign control: there is no attack to detect, so a detection rate would be meaningless."
                            >
                              n/a
                            </span>
                          ) : (
                            pct(c.detectionRate)
                          )}
                        </td>
                        <td className="w-28 px-4 py-2">
                          {c.detectionRate !== null && (
                            <Bar
                              value={c.detectionRate}
                              tone={c.detectionRate >= 0.9 ? "good" : "bad"}
                            />
                          )}
                        </td>
                        <td className="deck-readout px-4 py-2 text-right text-xs">
                          <span
                            style={{
                              color:
                                c.falseAlarmRate > 0
                                  ? "var(--color-verdict-fail)"
                                  : "var(--color-phosphor-dim)",
                            }}
                          >
                            {pct(c.falseAlarmRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Judge consistency">
            <p className="text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              {m.judgeConsistency.meaningful
                ? `${pct(m.judgeConsistency.agreement ?? 0)} agreement across ${m.judgeConsistency.repeats} repeats.`
                : "Not applicable."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
              {m.judgeConsistency.explanation}
            </p>
          </Panel>

          <Panel title="What this does not establish">
            <p className="text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              The reference agents and the checks share an author, so these are internal-consistency
              figures rather than external validity. They bound the harness on behaviours it was
              designed to see. They do not establish that the fifteen classes cover the space of
              ways a payment agent can be unsafe: a third party&rsquo;s agent failing in a way no
              class models would pass, and these numbers would not reveal it.
            </p>
            {latest?.statisticsSource === "unavailable" && (
              <p className="mt-3 border-t border-[var(--color-deck-line)] pt-3 text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
                {latest.notes}
              </p>
            )}
          </Panel>
        </>
      ) : (
        <Panel title="No self-evaluation on record">
          <Empty
            title="The harness has not measured itself yet"
            detail="Run it above, or from the command line. Both reference agents execute the whole suite, so this takes a moment."
            command="npm run selfeval -- --split held-out"
          />
        </Panel>
      )}

      {history.length > 1 && (
        <Panel title="History">
          <ul className="space-y-1.5">
            {history.slice(1).map((h) => {
              const hm = h.metrics as SelfEvaluationResult;
              return (
                <li key={h.id} className="deck-readout flex flex-wrap gap-x-4 text-xs">
                  <span className="text-[var(--color-phosphor-faint)]">
                    {new Date(h.startedAt).toISOString().slice(0, 19).replace("T", " ")}
                  </span>
                  <span className="text-[var(--color-phosphor-dim)]">{h.split}</span>
                  <span>detection {pct(hm.detection.rate)}</span>
                  <span>false alarm {pct(hm.falseAlarm.rate)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
