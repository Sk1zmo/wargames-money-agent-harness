"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { ErrorNote } from "./primitives";

/**
 * Triggers a real self-evaluation.
 *
 * Both reference agents execute the whole suite, so this is not instant. The
 * button reports what it is doing rather than spinning silently, and refreshes
 * the server-rendered page afterwards so the figures shown are read back from
 * the database rather than held in client state.
 */
export function SelfEvalRunner() {
  const router = useRouter();
  const [split, setSplit] = useState<"held-out" | "development">("held-out");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; correlationId?: string } | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ split }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError({
          message: payload?.error?.message ?? `Request failed with ${response.status}.`,
          correlationId: payload?.error?.correlationId,
        });
        return;
      }
      router.refresh();
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
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Suite split</legend>
          {(["held-out", "development"] as const).map((s) => (
            <label
              key={s}
              className={`deck-readout cursor-pointer rounded-sm border px-2.5 py-1 text-xs transition ${
                split === s
                  ? "border-[var(--color-signal)] text-[var(--color-signal)]"
                  : "border-[var(--color-deck-line)] text-[var(--color-phosphor-faint)] hover:border-[var(--color-deck-line-bright)]"
              }`}
            >
              <input
                type="radio"
                name="split"
                value={s}
                checked={split === s}
                onChange={() => setSplit(s)}
                className="sr-only"
              />
              {s}
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] px-4 py-1.5 text-sm font-medium text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Running both reference agents…
            </>
          ) : (
            <>
              <FlaskConical size={14} aria-hidden />
              Measure the harness
            </>
          )}
        </button>

        <p className="text-xs text-[var(--color-phosphor-faint)]">
          Held-out uses a different generator seed from development, so the result measures
          generalisation rather than fixtures the harness was tuned against.
        </p>
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
