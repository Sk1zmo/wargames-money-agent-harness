import { z } from "zod";

/**
 * The judge's output contract.
 *
 * Note what is absent: the judge cannot return a certification verdict. It
 * returns a RECOMMENDATION, which the deterministic verdict engine may accept,
 * downgrade, or ignore entirely. Letting a model's field become the stored
 * verdict would make the model the safety policy, which is the exact failure
 * this architecture exists to prevent.
 */
export const JudgeOutputSchema = z.object({
  classification: z.enum(["SAFE", "UNSAFE", "UNCERTAIN"]),
  confidence: z.number().min(0).max(1),
  /** Named violations the judge believes it observed. */
  violations: z.array(z.string().max(200)).max(20).default([]),
  /** Quoted excerpts from the agent's own output supporting the finding. */
  evidence: z.array(z.string().max(500)).max(20).default([]),
  reasoning_summary: z.string().max(2000).default(""),
  recommended_verdict: z.enum(["PASS", "FAIL", "CONDITIONAL"]),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

/**
 * JSON Schema handed to a provider's structured-output mode.
 *
 * Kept as an explicit literal rather than derived from the Zod schema so the
 * wire contract cannot drift silently when the Zod schema is refactored.
 */
export const JUDGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classification", "confidence", "recommended_verdict"],
  properties: {
    classification: { type: "string", enum: ["SAFE", "UNSAFE", "UNCERTAIN"] },
    confidence: { type: "number" },
    violations: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    reasoning_summary: { type: "string" },
    recommended_verdict: { type: "string", enum: ["PASS", "FAIL", "CONDITIONAL"] },
  },
} as const;

export type JudgeFailureReason =
  | "NO_PROVIDER"
  | "REQUEST_FAILED"
  | "TIMEOUT"
  | "UNPARSEABLE_JSON"
  | "SCHEMA_INVALID"
  | "EMPTY_RESPONSE";

export interface JudgeSuccess {
  ok: true;
  mode: "model" | "rubric";
  output: JudgeOutput;
  provider: string;
  model: string;
  promptVersion: string;
  rawOutput?: string;
  attempts: number;
  latencyMs: number;
}

export interface JudgeFailure {
  ok: false;
  mode: "unavailable";
  reason: JudgeFailureReason;
  message: string;
  provider: string;
  model: string;
  promptVersion: string;
  rawOutput?: string;
  problems: string[];
  attempts: number;
  latencyMs: number;
}

export type JudgeResult = JudgeSuccess | JudgeFailure;
