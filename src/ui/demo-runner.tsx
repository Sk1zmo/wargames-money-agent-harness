"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Loader2, Play, TriangleAlert } from "lucide-react";
import type { Verdict } from "../db/schema";
import type { CheckOutcome } from "../scenarios/checks";
import { Bar, ErrorNote, VerdictChip } from "./primitives";

/**
 * Runs a demo scenario against the live API and renders whatever comes back.
 *
 * The button executes a real certification. There is no canned result behind
 * it, and the component has no way to display an outcome the server did not
 * produce - including when the outcome contradicts the demo's own stated
 * expectation, which is rendered as a contradiction rather than hidden.
 */

interface DemoExecution {
  executionId: string;
  scenarioId: string;
  attackClass: string;
  verdict: Verdict;
  expectedVerdict: Verdict;
  decidingRule: string;
  reasons: string[];
  checks: CheckOutcome[];
  totalLatencyMs: number;
}

interface DemoResponse {
  scenario: string;
  title: string;
  premise: string;
  expectation: string;
  expectationMet: boolean;
  observed: string;
  run: {
    runId: string;
    overallVerdict: Verdict;
    overallScore: number;
    durationMs: number;
    summary: { total: number; pass: number; fail: number };
    executions: DemoExecution[];
  };
}

export function DemoRunner({
  scenario,
  title,
  premise,
  expectation,
}: {
  scenario: string;
  title: string;
  premise: string;
  expectation: string;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<{ message: string; correlationId?: string } | null>(null);
  const [openExecution, setOpenExecution] = useState<string | null>(null);

  async function run() {
    setState("running");
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/demo/${scenario}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError({
          message: payload?.error?.message ?? `Request failed with ${response.status}.`,
          correlationId: payload?.error?.correlationId,
        });
        setState("error");
        return;
      }
      setResult(payload as DemoResponse);
      setState("done");
    } catch (cause) {
      setError({
        message:
          cause instanceof Error
            ? `Could not reach the harness: ${cause.message}`
            : "Could not reach the harness.",
      });
      setState("error");
    }
  }

  return (
    <section className="deck-panel">
      <header className="border-b border-[var(--color-deck-line)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-phosphor)]">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-phosphor-dim)]">{premise}</p>
      </header>

      <div className="px-4 py-3">
        <p className="text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
          <span className="deck-label">Expectation · </span>
          {expectation}
        </p>

        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="mt-3 inline-flex items-center gap-2 rounded-sm border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] px-4 py-2 text-sm font-medium text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {state === "running" ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Executing scenarios…
            </>
          ) : (
            <>
              <Play size={14} aria-hidden />
              {state === "done" ? "Run again" : "Run for real"}
            </>
          )}
        </button>

        {state === "running" && (
          <p className="mt-2 text-xs text-[var(--color-phosphor-faint)]">
            Each scenario builds a fresh sandbox, executes the target against it, runs the
            deterministic checks and computes a verdict.
          </p>
        )}

        {state === "error" && error && (
          <div className="mt-3">
            <ErrorNote message={error.message} {...(error.correlationId ? { correlationId: error.correlationId } : {})} />
          </div>
        )}

        {state === "done" && result && (
          <div className="mt-4 space-y-3">
            {/* Whether reality matched the story we told about it. */}
            <div
              className="flex items-start gap-2.5 rounded-sm border px-3 py-2.5"
              style={{
                borderColor: result.expectationMet
                  ? "color-mix(in oklab, var(--color-verdict-pass) 40%, transparent)"
                  : "color-mix(in oklab, var(--color-verdict-conditional) 45%, transparent)",
                background: result.expectationMet
                  ? "color-mix(in oklab, var(--color-verdict-pass) 7%, transparent)"
                  : "color-mix(in oklab, var(--color-verdict-conditional) 8%, transparent)",
              }}
            >
              {result.expectationMet ? (
                <CircleCheck size={15} className="mt-0.5 shrink-0 text-[var(--color-verdict-pass)]" aria-hidden />
              ) : (
                <TriangleAlert
                  size={15}
                  className="mt-0.5 shrink-0 text-[var(--color-verdict-conditional)]"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--color-phosphor)]">
                  {result.expectationMet
                    ? "The run matched the stated expectation."
                    : "The run did NOT match the stated expectation."}
                </p>
                <p className="deck-readout mt-1 text-xs text-[var(--color-phosphor-dim)]">
                  {result.observed}
                </p>
                {!result.expectationMet && (
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
                    Shown as a mismatch rather than smoothed over. A demo whose narrative has stopped
                    being true is information about the harness, not something to hide.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <VerdictChip verdict={result.run.overallVerdict} size="lg" />
              <span className="deck-readout text-xs text-[var(--color-phosphor-dim)]">
                score {result.run.overallScore.toFixed(4)}
              </span>
              <span className="deck-readout text-xs text-[var(--color-phosphor-faint)]">
                {result.run.summary.total} scenario(s) · {result.run.durationMs}ms
              </span>
            </div>

            <Bar
              value={result.run.overallScore}
              tone={result.run.overallVerdict === "PASS" ? "good" : "bad"}
            />

            <ul className="space-y-1.5">
              {result.run.executions.map((e) => {
                const open = openExecution === e.executionId;
                return (
                  <li key={e.executionId} className="rounded-sm border border-[var(--color-deck-line)]">
                    <button
                      type="button"
                      onClick={() => setOpenExecution(open ? null : e.executionId)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[var(--color-deck-raised)]"
                    >
                      <VerdictChip verdict={e.verdict} />
                      <span className="deck-readout min-w-0 flex-1 truncate text-xs text-[var(--color-phosphor-dim)]">
                        {e.attackClass.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="deck-readout text-[0.65rem] text-[var(--color-phosphor-faint)]">
                        {e.decidingRule}
                      </span>
                    </button>

                    {open && (
                      <div className="space-y-2.5 border-t border-[var(--color-deck-line)] px-3 py-2.5">
                        <ul className="space-y-1">
                          {e.checks.map((c) => (
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

                        <div className="border-t border-[var(--color-deck-line)] pt-2">
                          <p className="deck-label mb-1">Why this verdict</p>
                          <ul className="space-y-0.5">
                            {e.reasons.map((r, i) => (
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
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
