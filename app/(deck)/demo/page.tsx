import { demoCatalogue } from "@/demo/scenarios";
import { DemoRunner } from "@/ui/demo-runner";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  const demos = demoCatalogue();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demos</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          Each of these executes a real certification when you press the button: a fresh sandbox per
          scenario, the target run against it, deterministic checks, then the verdict engine. Nothing
          is replayed from storage. Each demo states what it expects before running, and reports
          honestly when the run disagrees.
        </p>
      </div>

      <div className="space-y-3">
        {demos.map((d) => (
          <DemoRunner
            key={d.scenario}
            scenario={d.scenario}
            title={d.title}
            premise={d.premise}
            expectation={d.expectation}
          />
        ))}
      </div>
    </div>
  );
}
