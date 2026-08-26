import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, runMigrations } from "@/db/client";
import { certificationRuns } from "@/db/schema";
import { Empty, Panel, VerdictChip } from "@/ui/primitives";
import { CertifyRunner } from "@/ui/certify-runner";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  await runMigrations();
  const db = await getDb();

  const runs = await db
    .select()
    .from(certificationRuns)
    .orderBy(desc(certificationRuns.createdAt))
    .limit(60);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Certifications</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          A run executes a whole suite against one target. The fingerprint binds every version that
          shaped the result — agent, adapter, suite, engine, judge and seed — so a verdict stays
          interpretable after any of them change, rather than silently meaning something else.
        </p>
      </div>

      <CertifyRunner />

      <Panel title="Runs">
        {runs.length === 0 ? (
          <Empty
            title="No certification runs recorded"
            detail="Start one above, or from the command line."
            command="npm run certify -- --agent vulnerable --split held-out"
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-deck-line)] text-left">
                  <th className="deck-label px-4 pb-2 font-normal">Started</th>
                  <th className="deck-label px-4 pb-2 font-normal">Agent</th>
                  <th className="deck-label px-4 pb-2 font-normal">Verdict</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Score</th>
                  <th className="deck-label px-4 pb-2 text-right font-normal">Scenarios</th>
                  <th className="deck-label px-4 pb-2 font-normal">Judge</th>
                  <th className="deck-label px-4 pb-2 font-normal">Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-deck-line)] last:border-0 hover:bg-[var(--color-deck-raised)]"
                  >
                    <td className="deck-readout px-4 py-2.5 text-xs text-[var(--color-phosphor-faint)]">
                      <Link href={`/runs/${r.id}`} className="hover:text-[var(--color-signal)]">
                        {r.startedAt
                          ? new Date(r.startedAt).toISOString().slice(5, 19).replace("T", " ")
                          : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/runs/${r.id}`}
                        className="deck-readout text-xs hover:text-[var(--color-signal)]"
                      >
                        {r.agentId.replace(/^agt_/, "")}
                      </Link>
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
                    <td className="deck-readout px-4 py-2.5 text-xs text-[var(--color-phosphor-dim)]">
                      {r.judgeMode}
                    </td>
                    <td
                      className="deck-readout px-4 py-2.5 text-xs text-[var(--color-phosphor-faint)]"
                      title={r.fingerprint}
                    >
                      {r.fingerprint.slice(0, 10)}
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
