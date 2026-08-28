import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Gauge,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { ATTACK_CLASSES } from "@/db/schema";
import { environmentStatus } from "@/shared/env";
import { DeckBackdrop, Reveal, Typewriter } from "@/ui/intro";
import { VERDICT_META } from "@/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * Landing sequence.
 *
 * The page argues the product rather than advertising it: what the instrument
 * is for, what it refuses to do, and what it cannot establish. Every number
 * shown further in comes from a real run; this page states no measurements at
 * all, because it has not run anything yet.
 */
export default function Landing() {
  const env = environmentStatus();

  return (
    <main className="relative">
      {/* ---------------------------------------------------------------- */}
      {/* Scene 1: the deck powers on                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="deck-scanlines scene relative flex min-h-[100svh] flex-col justify-center overflow-hidden">
        <DeckBackdrop />
        <div className="deck-grid pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto w-full max-w-5xl">
          <div className="deck-boot" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-verdict-pass)" }}
                aria-hidden
              />
              <span className="deck-label">Certification harness · {env.harnessMode}</span>
            </div>
          </div>

          <h1
            className="deck-boot hero-title mt-6 text-balance font-bold tracking-tight"
            style={{ animationDelay: "220ms" }}
          >
            Would you give this agent
            <span className="block text-[var(--color-signal)]">your card?</span>
          </h1>

          <p
            className="deck-boot deck-readout mt-7 max-w-2xl text-sm leading-relaxed text-[var(--color-phosphor-dim)] sm:text-base"
            style={{ animationDelay: "380ms" }}
          >
            <Typewriter text="An adversarial test bench for AI agents that hold delegated payment authority. Fifteen attack classes, sixteen deterministic checks, and a verdict engine that no model output can overrule." />
          </p>

          <div
            className="deck-boot mt-9 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "620ms" }}
          >
            <Link
              href="/overview"
              className="group inline-flex items-center gap-2 rounded-sm border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] px-5 py-2.5 text-sm font-medium text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_24%,transparent)]"
            >
              Open the deck
              <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-deck-line-bright)] px-5 py-2.5 text-sm text-[var(--color-phosphor-dim)] transition hover:border-[var(--color-phosphor-faint)] hover:text-[var(--color-phosphor)]"
            >
              <SquareTerminal size={15} aria-hidden />
              Run a live demo
            </Link>
          </div>

          {/* The single most important claim on the page. */}
          <div
            className="deck-boot mt-12 inline-flex max-w-xl items-start gap-3 rounded-sm border border-[color-mix(in_oklab,var(--color-verdict-pass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-verdict-pass)_7%,transparent)] px-4 py-3"
            style={{ animationDelay: "780ms" }}
          >
            <Ban size={16} className="mt-0.5 shrink-0 text-[var(--color-verdict-pass)]" aria-hidden />
            <p className="text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
              <span className="font-semibold text-[var(--color-phosphor)]">
                There is no live-money mode.
              </span>{" "}
              Not disabled, not gated behind a flag —{" "}
              <span className="deck-readout">HARNESS_MODE</span> accepts two values and neither
              reaches a real payment rail. Setting it to{" "}
              <span className="deck-readout">LIVE</span> stops the process from starting.
            </p>
          </div>
        </div>

        <div
          className="deck-label absolute inset-x-0 bottom-8 text-center"
          aria-hidden
        >
          scroll
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Scene 2: the fifteen classes boot in sequence                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="scene scene-block relative border-t border-[var(--color-deck-line)]">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <span className="deck-label">Attack surface</span>
            <h2 className="scene-title mt-3 max-w-3xl text-balance font-semibold leading-tight">
              Fifteen ways a payment agent goes wrong
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              Fourteen adversarial classes and one benign control. The control is not filler: a
              suite made only of attacks has a trivial winning strategy, which is to refuse
              everything. An agent that never acts passes every safety check while being useless,
              so one class exists purely to catch that.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ATTACK_CLASSES.map((cls, i) => {
              const benign = cls === "BENIGN_CONTROL";
              return (
                <Reveal key={cls} delay={i * 35}>
                  <div
                    className="deck-panel group relative overflow-hidden px-3 py-4 transition hover:border-[var(--color-deck-line-bright)]"
                    style={
                      benign
                        ? {
                            borderColor:
                              "color-mix(in oklab, var(--color-verdict-pass) 32%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      {benign ? (
                        <ShieldCheck size={13} className="text-[var(--color-verdict-pass)]" aria-hidden />
                      ) : (
                        <ScanLine size={13} className="text-[var(--color-phosphor-faint)]" aria-hidden />
                      )}
                      <span className="deck-readout text-[0.6rem] text-[var(--color-phosphor-faint)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="deck-readout mt-2 text-[0.7rem] leading-snug text-[var(--color-phosphor)]">
                      {cls.replace(/_/g, " ")}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Scene 3: the verdict board                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="scene scene-block relative border-t border-[var(--color-deck-line)]">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <span className="deck-label">Verdict engine</span>
            <h2 className="scene-title mt-3 max-w-3xl text-balance font-semibold leading-tight">
              Uncertainty never becomes a pass
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              Rules apply in a fixed order and the first match wins. A mandatory check failure is
              evaluated <em>before</em> any judge rule, so a confident model cannot rescue an agent
              that paid ten times its cap. PASS is only reached by falling through every other rule.
            </p>
          </Reveal>

          <div className="auto-cards-sm mt-10 gap-2">
            {(Object.keys(VERDICT_META) as Array<keyof typeof VERDICT_META>).map((v, i) => {
              const meta = VERDICT_META[v];
              const Icon = meta.icon;
              return (
                <Reveal key={v} delay={i * 70}>
                  <div className="deck-panel h-full px-4 py-4">
                    <Icon size={18} style={{ color: meta.color }} aria-hidden />
                    <p
                      className="deck-readout mt-3 text-xs font-semibold tracking-wide"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
                      {meta.meaning}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={200}>
            <div className="deck-panel relative mt-10 overflow-hidden px-5 py-5">
              <div className="deck-sweep-line" aria-hidden />
              <div className="relative flex flex-wrap items-start gap-3">
                <Gauge size={17} className="mt-0.5 text-[var(--color-signal)]" aria-hidden />
                <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
                  The simulator models what a <em>payment provider</em> enforces, and deliberately
                  permits what the <em>agent</em> is supposed to enforce on itself. A delegated
                  spend cap is not a provider rule. If the sandbox silently blocked every over-cap
                  payment, an agent that tried to spend ten times its limit would look identical to
                  one that never tried — and the harness would certify both as safe.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Scene 4: what this does not establish                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="scene scene-block relative border-t border-[var(--color-deck-line)]">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <span className="deck-label">Limits</span>
            <h2 className="scene-title mt-3 text-balance font-semibold leading-tight">
              What a PASS does not mean
            </h2>
            <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
              <p>
                A PASS says one agent satisfied the checks defined for the scenarios it was given,
                under the conditions it was given them. It is not a claim of general safety, and it
                does not transfer to a different version of that agent.
              </p>
              <p>
                The harness measures itself against two bundled reference agents whose behaviour is
                known by construction. Those figures are{" "}
                <span className="text-[var(--color-phosphor)]">internal consistency</span>, not
                external validity — the reference agents and the checks share an author. They bound
                the instrument on behaviours it was built to see. They do not establish that fifteen
                classes cover every way a payment agent can be unsafe.
              </p>
              <p className="flex items-start gap-2.5">
                <ShieldAlert
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--color-verdict-conditional)]"
                  aria-hidden
                />
                <span>
                  This is an evaluation instrument, not an attack toolkit. The adversarial content
                  is generic social-engineering phrasing aimed at a simulator holding no money. It
                  contains no working technique against real payment infrastructure.
                </span>
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <Link
              href="/overview"
              className="group mt-10 inline-flex items-center gap-2 rounded-sm border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_14%,transparent)] px-5 py-2.5 text-sm font-medium text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_24%,transparent)]"
            >
              Open the deck
              <ArrowRight size={15} className="transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="scene border-t border-[var(--color-deck-line)] py-8">
        <div className="deck-readout mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 text-[0.7rem] text-[var(--color-phosphor-faint)]">
          <span>mode {env.harnessMode}</span>
          <span>live money reachable: no</span>
          <span>db {env.database.driver}</span>
          <span>judge {env.judge.modelJudgeEnabled ? env.judge.model : "deterministic rubric"}</span>
        </div>
      </footer>
    </main>
  );
}
