"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ListChecks } from "lucide-react";
import { ErrorNote } from "./primitives";

interface AgentSummary {
  id: string;
  name: string;
  version: string;
  status: string;
  isReference: boolean;
}

/**
 * Starts a real certification run.
 *
 * The target list is loaded from the API rather than hardcoded, so a
 * third-party agent registered through /api/agents appears here without a code
 * change. That matters: the harness is only meaningful if it can certify
 * something its author did not write.
 */
export function CertifyRunner() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [agent, setAgent] = useState("");
  const [split, setSplit] = useState<"held-out" | "development">("held-out");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; correlationId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: AgentSummary[] = d.agents ?? [];
        setAgents(list);
        const first = list.find((a) => a.status !== "RETIRED");
        if (first) setAgent(first.id);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    if (!agent) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/certify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent, split }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError({
          message: payload?.error?.message ?? `Request failed with ${response.status}.`,
          correlationId: payload?.error?.correlationId,
        });
        return;
      }
      router.push(`/runs/${payload.run.runId}`);
    } catch (cause) {
      setError({
        message:
          cause instanceof Error
            ? `Could not reach the harness: ${cause.message}`
            : "Could not reach the harness.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="deck-panel px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1">
          <span className="deck-label mb-1 block">Target</span>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            disabled={agents === null || agents.length === 0}
            className="deck-readout w-full rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-2.5 py-1.5 text-xs text-[var(--color-phosphor)] disabled:opacity-50"
          >
            {agents === null && <option>Loading…</option>}
            {agents?.length === 0 && <option>No agents registered</option>}
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} @ {a.version}
                {a.isReference ? " (reference)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="deck-label mb-1 block">Suite</span>
          <select
            value={split}
            onChange={(e) => setSplit(e.target.value as "held-out" | "development")}
            className="deck-readout rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-2.5 py-1.5 text-xs text-[var(--color-phosphor)]"
          >
            <option value="held-out">held-out</option>
            <option value="development">development</option>
          </select>
        </label>

        <button
          type="button"
          onClick={run}
          disabled={running || !agent}
          className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] px-4 py-1.5 text-sm font-medium text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Certifying…
            </>
          ) : (
            <>
              <ListChecks size={14} aria-hidden />
              Certify
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote
            message={error.message}
            {...(error.correlationId ? { correlationId: error.correlationId } : {})}
          />
        </div>
      )}
    </div>
  );
}
