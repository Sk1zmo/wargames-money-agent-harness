export const CERTIFICATE_VERSION = "certification-report-1.0.0";

/**
 * The certification report.
 *
 * ---------------------------------------------------------------------------
 * A CERTIFICATE THAT CANNOT BE MISREAD AS A GUARANTEE
 * ---------------------------------------------------------------------------
 * The dangerous version of this document is the one that says PASS at the top
 * in green and nothing else. Somebody forwards it, somebody else treats it as
 * an assurance that the agent is safe, and neither has any idea what was
 * actually tested.
 *
 * So the scope comes BEFORE the verdict. The first thing in the document is
 * which attack classes were exercised and which were not, and a class that was
 * never run is listed by name. A reader who stops after the first section still
 * knows the shape of what they are holding.
 *
 * The verdict itself is stated with its own limits attached: it covers this
 * agent, at this version, against this suite, at this date. It is not a
 * statement about the agent tomorrow, and the document says so where the
 * verdict is, not in a footnote.
 */

export interface CertificateInput {
  run: {
    id: string;
    agentId: string;
    agentName: string;
    agentVersion: string;
    suiteId: string;
    suiteVersion: string;
    verdict: string;
    createdAt: string;
    fingerprint: string | null;
  };
  executions: Array<{
    scenarioId: string;
    attackClass: string;
    verdict: string | null;
    riskLevel: string | null;
    summary: string | null;
    totalLatencyMs: number;
  }>;
  allAttackClasses: readonly string[];
  environment: {
    harnessMode: string;
    moneyReachable: boolean;
    modelProvider: string;
    modelName: string;
  };
  generatedAt: string;
}

function bar(value: number, total: number, width = 24): string {
  if (total <= 0) return "".padEnd(width, ".");
  const filled = Math.round((value / total) * width);
  return "#".repeat(filled).padEnd(width, ".");
}

export function toMarkdown(input: CertificateInput): string {
  const out: string[] = [];
  const executed = new Set(input.executions.map((e) => e.attackClass));
  const untested = input.allAttackClasses.filter((c) => !executed.has(c));

  out.push(`# Certification report`);
  out.push("");
  out.push(
    `**${input.run.agentName}** \`${input.run.agentVersion}\` against suite \`${input.run.suiteId}@${input.run.suiteVersion}\``,
  );
  out.push("");

  /* -- scope first ------------------------------------------------------- */
  out.push("## What was tested");
  out.push("");
  out.push(
    `${executed.size} of ${input.allAttackClasses.length} attack classes were exercised, over ` +
      `${input.executions.length} scenario executions.`,
  );
  out.push("");

  if (untested.length > 0) {
    out.push("### Not tested");
    out.push("");
    for (const attackClass of untested) {
      out.push(`- \`${attackClass}\` — no scenario in this class was run.`);
    }
    out.push("");
    out.push(
      "**This report says nothing about the classes above.** A verdict covers what was exercised and " +
        "no more; an untested class is not a passed one.",
    );
    out.push("");
  } else {
    out.push("Every attack class in the suite was exercised.");
    out.push("");
  }

  /* -- verdict, with its limits attached --------------------------------- */
  out.push("## Verdict");
  out.push("");
  out.push(`### ${input.run.verdict}`);
  out.push("");
  out.push(
    `This verdict covers **${input.run.agentName} ${input.run.agentVersion}** against ` +
      `**${input.run.suiteId}@${input.run.suiteVersion}**, run ${input.run.createdAt.slice(0, 10)}. ` +
      "It is not a statement about the agent at any other version, against any other suite, or on any " +
      "other day. An agent that passes today and is redeployed tomorrow has not been certified.",
  );
  out.push("");
  if (input.run.fingerprint) {
    out.push(
      `Fingerprint \`${input.run.fingerprint}\` binds the agent version, suite version and harness ` +
        "configuration that produced this result. A later run against a changed agent produces a " +
        "different fingerprint, so this certificate is visibly stale rather than silently carried forward.",
    );
    out.push("");
  }

  /* -- by class ---------------------------------------------------------- */
  out.push("## By attack class");
  out.push("");
  out.push("| Class | Run | Refused | Let through | Awaiting review |");
  out.push("|---|---|---|---|---|");

  for (const attackClass of input.allAttackClasses) {
    const rows = input.executions.filter((e) => e.attackClass === attackClass);
    if (rows.length === 0) {
      out.push(`| \`${attackClass}\` | — | — | — | — |`);
      continue;
    }
    const passed = rows.filter((r) => r.verdict === "PASS").length;
    const failed = rows.filter((r) => r.verdict === "FAIL").length;
    const review = rows.filter((r) => r.verdict === "HUMAN_REVIEW" || r.verdict === "CONDITIONAL").length;
    out.push(
      `| \`${attackClass}\` | ${rows.length} | ${passed} | ${failed > 0 ? `**${failed}**` : "0"} | ${review} |`,
    );
  }
  out.push("");

  /* -- what got through -------------------------------------------------- */
  const failures = input.executions.filter((e) => e.verdict === "FAIL");
  out.push("## What the agent let through");
  out.push("");
  if (failures.length === 0) {
    out.push("Nothing. Every executed scenario was refused correctly.");
    out.push("");
    out.push(
      "That is a result about this suite, not about every attack that exists. The suite is a floor, " +
        "not a ceiling.",
    );
  } else {
    out.push(`${failures.length} of ${input.executions.length} executions were not refused.`);
    out.push("");
    for (const failure of failures) {
      out.push(`### \`${failure.scenarioId}\` — ${failure.attackClass}`);
      out.push("");
      out.push(`Risk: **${failure.riskLevel ?? "unclassified"}**`);
      out.push("");
      out.push(failure.summary ?? "No summary was recorded for this execution.");
      out.push("");
    }
  }

  /* -- distribution ------------------------------------------------------ */
  const counts = new Map<string, number>();
  for (const execution of input.executions) {
    const key = execution.verdict ?? "UNSCORED";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  out.push("## Verdict distribution");
  out.push("");
  out.push("```");
  for (const [verdict, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`${verdict.padEnd(14)} ${String(n).padStart(4)}  ${bar(n, input.executions.length)}`);
  }
  out.push("```");
  out.push("");

  /* -- environment ------------------------------------------------------- */
  out.push("## The harness that produced this");
  out.push("");
  out.push(`| | |`);
  out.push(`|---|---|`);
  out.push(`| Mode | \`${input.environment.harnessMode}\` |`);
  out.push(`| Real money reachable | ${input.environment.moneyReachable ? "**YES**" : "no"} |`);
  out.push(`| Model provider | ${input.environment.modelProvider} |`);
  out.push(`| Model | ${input.environment.modelName} |`);
  out.push(`| Run id | \`${input.run.id}\` |`);
  out.push("");
  out.push(
    "No scenario in this harness can reach a real payment. The mode above is enforced where the " +
      "environment is parsed, not by convention, and a live value is refused by name.",
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push(`Generated ${input.generatedAt} by ${CERTIFICATE_VERSION}.`);

  return out.join("\n");
}
