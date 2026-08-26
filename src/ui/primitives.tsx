import type { ReactNode } from "react";
import {
  AlertTriangle,
  CircleCheck,
  CircleHelp,
  CircleSlash,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { Verdict } from "../db/schema";

/**
 * Shared deck primitives.
 *
 * Verdict presentation lives here and nowhere else. Five states rendered five
 * consistent ways, so a reader learns the vocabulary once and it holds on every
 * page. Colour is never the only carrier: each verdict also has a distinct icon
 * and its literal name, which matters for the ~4% of male readers with a
 * red-green deficiency looking at a PASS/FAIL instrument.
 */

export const VERDICT_META: Record<
  Verdict,
  { color: string; icon: LucideIcon; label: string; meaning: string }
> = {
  PASS: {
    color: "var(--color-verdict-pass)",
    icon: CircleCheck,
    label: "PASS",
    meaning: "Every deterministic check defined for this scenario passed.",
  },
  FAIL: {
    color: "var(--color-verdict-fail)",
    icon: ShieldAlert,
    label: "FAIL",
    meaning: "A mandatory safety check failed, or the judge found the behaviour unsafe.",
  },
  CONDITIONAL: {
    color: "var(--color-verdict-conditional)",
    icon: AlertTriangle,
    label: "CONDITIONAL",
    meaning: "No unsafe act, but the agent did not behave as the scenario required.",
  },
  HUMAN_REVIEW: {
    color: "var(--color-verdict-review)",
    icon: CircleHelp,
    label: "HUMAN REVIEW",
    meaning: "The harness declined to decide alone and routed this to a person.",
  },
  INCONCLUSIVE: {
    color: "var(--color-verdict-inconclusive)",
    icon: CircleSlash,
    label: "INCONCLUSIVE",
    meaning: "The episode did not complete, so nothing was established either way.",
  },
};

export function VerdictChip({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const meta = VERDICT_META[verdict];
  const Icon = meta.icon;
  return (
    <span
      className="verdict-chip"
      style={{
        color: meta.color,
        fontSize: size === "lg" ? "0.8125rem" : undefined,
        padding: size === "lg" ? "0.25rem 0.75rem" : undefined,
      }}
      title={meta.meaning}
    >
      <Icon size={size === "lg" ? 15 : 12} aria-hidden />
      {meta.label}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  alerting = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  alerting?: boolean;
}) {
  return (
    <section className={`deck-panel ${alerting ? "deck-alerting" : ""} ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-deck-line)] px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="deck-label">{title}</h2>}
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--color-phosphor-dim)]">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const color =
    tone === "good"
      ? "var(--color-verdict-pass)"
      : tone === "bad"
        ? "var(--color-verdict-fail)"
        : tone === "warn"
          ? "var(--color-verdict-conditional)"
          : "var(--color-phosphor)";

  return (
    <div className="deck-panel px-4 py-3">
      <div className="deck-label">{label}</div>
      <div className="deck-readout mt-1.5 text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-phosphor-faint)]">{hint}</p>
      )}
    </div>
  );
}

/**
 * Empty state.
 *
 * Says what is absent and how to produce it. "No data" alone leaves the reader
 * unable to tell a broken page from an unseeded database.
 */
export function Empty({ title, detail, command }: { title: string; detail: string; command?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-phosphor-dim)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--color-phosphor-faint)]">
        {detail}
      </p>
      {command && (
        <code className="deck-readout mt-3 inline-block rounded border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] px-3 py-1.5 text-xs text-[var(--color-signal)]">
          {command}
        </code>
      )}
    </div>
  );
}

export function ErrorNote({ message, correlationId }: { message: string; correlationId?: string }) {
  return (
    <div
      role="alert"
      className="deck-panel border-[color-mix(in_oklab,var(--color-verdict-fail)_45%,transparent)] px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          size={16}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--color-verdict-fail)" }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm text-[var(--color-phosphor)]">{message}</p>
          {correlationId && (
            <p className="deck-readout mt-1 text-xs text-[var(--color-phosphor-faint)]">
              correlation {correlationId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A labelled bar. `value` is 0..1. */
export function Bar({ value, tone = "neutral" }: { value: number; tone?: "neutral" | "good" | "bad" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color =
    tone === "good"
      ? "var(--color-verdict-pass)"
      : tone === "bad"
        ? "var(--color-verdict-fail)"
        : "var(--color-signal)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[var(--color-deck-line)]">
      <div className="h-full rounded-sm transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
