import { ShieldCheck, Target } from "lucide-react";
import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { listSuites, loadSuiteScenarios } from "@/scenarios/store";
import { ADVISORY_CHECKS, DETERMINISTIC_CHECKS, MANDATORY_CHECKS } from "@/scenarios/checks";
import { Empty, Panel, VerdictChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

const RISK_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-verdict-fail)",
  HIGH: "var(--color-verdict-conditional)",
  MEDIUM: "var(--color-signal)",
  LOW: "var(--color-phosphor-faint)",
};

export default async function ScenariosPage() {
  await ensureBootstrapped();
  const db = await getDb();

  const suites = await listSuites(db);
  const heldOut = suites.find((s) => s.split === "held-out") ?? suites[0];
  const scenarios = heldOut ? await loadSuiteScenarios(db, heldOut.id) : [];

  const byClass = new Map<string, typeof scenarios>();
  for (const s of scenarios) {
    const list = byClass.get(s.attackClass) ?? [];
    list.push(s);
    byClass.set(s.attackClass, list);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attack classes</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          Fourteen adversarial classes plus one benign control. The control is load-bearing: a suite
          made only of attacks can be beaten by refusing everything, which would certify a useless
          agent as perfectly safe. Prompts are shown in full — the adversarial content is generic
          social-engineering phrasing aimed at a simulator holding no money, and carries no working
          technique against real payment infrastructure.
        </p>
      </div>

      <div className="auto-cards-sm gap-3">
        <div className="deck-panel px-4 py-3">
          <div className="deck-label">Suites</div>
          <p className="deck-readout mt-1 text-xl font-semibold">{suites.length}</p>
          <p className="mt-1 text-xs text-[var(--color-phosphor-faint)]">
            Development and held-out, generated from different seeds.
          </p>
        </div>
        <div className="deck-panel px-4 py-3">
          <div className="deck-label">Scenarios shown</div>
          <p className="deck-readout mt-1 text-xl font-semibold">{scenarios.length}</p>
          <p className="mt-1 text-xs text-[var(--color-phosphor-faint)]">
            {heldOut ? `${heldOut.name}@${heldOut.version}` : "no suite"}
          </p>
        </div>
        <div className="deck-panel px-4 py-3">
          <div className="deck-label">Checks</div>
          <p className="deck-readout mt-1 text-xl font-semibold">{DETERMINISTIC_CHECKS.length}</p>
          <p className="mt-1 text-xs text-[var(--color-phosphor-faint)]">
            {MANDATORY_CHECKS.size} mandatory · {ADVISORY_CHECKS.size} advisory
          </p>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <Panel title="No scenarios">
          <Empty
            title="No suite has been generated"
            detail="Scenarios are generated deterministically from a seed and then stored, so a certification stays interpretable after the generator changes."
            command="npm run db:seed"
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {[...byClass.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cls, list]) => {
              const first = list[0];
              if (!first) return null;
              const benign = cls === "BENIGN_CONTROL";
              return (
                <Panel
                  key={cls}
                  title={cls.replace(/_/g, " ")}
                  subtitle={first.description}
                  action={
                    <span
                      className="deck-readout shrink-0 text-[0.65rem]"
                      style={{ color: RISK_COLOR[first.riskLevel] }}
                    >
                      {first.riskLevel}
                    </span>
                  }
                >
                  <div className="flex items-start gap-2.5">
                    {benign ? (
                      <ShieldCheck
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--color-verdict-pass)]"
                        aria-hidden
                      />
                    ) : (
                      <Target
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--color-phosphor-faint)]"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="deck-label mb-1">Expected of a safe agent</p>
                        <ul className="space-y-0.5">
                          {first.expectedSafeBehavior.map((b, i) => (
                            <li key={i} className="text-xs text-[var(--color-phosphor-dim)]">
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="deck-label mb-1">Checks applied</p>
                        <div className="flex flex-wrap gap-1.5">
                          {first.deterministicChecks.map((c) => (
                            <span
                              key={c}
                              className="deck-readout rounded-sm border px-1.5 py-0.5 text-[0.65rem]"
                              style={{
                                borderColor: MANDATORY_CHECKS.has(c)
                                  ? "color-mix(in oklab, var(--color-verdict-fail) 40%, transparent)"
                                  : "var(--color-deck-line)",
                                color: MANDATORY_CHECKS.has(c)
                                  ? "var(--color-verdict-fail)"
                                  : "var(--color-phosphor-faint)",
                              }}
                              title={
                                MANDATORY_CHECKS.has(c)
                                  ? "Mandatory: failing this is disqualifying on its own, and no judge confidence can overturn it."
                                  : "Advisory or behavioural: failure downgrades rather than disqualifies."
                              }
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      <details className="group">
                        <summary className="deck-label cursor-pointer select-none hover:text-[var(--color-phosphor-dim)]">
                          Example prompt ({list.length} variant{list.length === 1 ? "" : "s"})
                        </summary>
                        <pre className="deck-readout mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] p-3 text-[0.7rem] leading-relaxed text-[var(--color-phosphor-dim)]">
                          {first.prompt}
                        </pre>
                      </details>

                      <div className="flex items-center gap-2 border-t border-[var(--color-deck-line)] pt-2.5">
                        <span className="deck-label">Correct outcome</span>
                        <VerdictChip verdict={first.expectedVerdict} />
                      </div>
                    </div>
                  </div>
                </Panel>
              );
            })}
        </div>
      )}
    </div>
  );
}
