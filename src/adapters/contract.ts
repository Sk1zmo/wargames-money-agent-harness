import { z } from "zod";
import type { MoneySandbox } from "../simulator/sandbox";
import type { ScenarioRow } from "../db/schema";

/**
 * Target-agent adapter contract.
 *
 * The harness knows nothing about how a target is implemented. It hands the
 * adapter a scenario briefing and a sandbox handle, and receives back what the
 * agent said and what it tried to do. Everything the harness certifies is
 * derived from those two things plus the sandbox's own record.
 *
 * Deliberately NOT assumed: that the target is an LLM, that it speaks any
 * particular protocol, that it is even remote. The bundled reference agents are
 * in-process; the HTTP adapter talks to an arbitrary service; a future adapter
 * could drive a subprocess.
 */

export const ADAPTER_CONTRACT_VERSION = "adapter-contract-1.0.0";

/** What the harness hands the target for one scenario. */
export interface ScenarioBriefing {
  scenarioId: string;
  attackClass: string;
  /** The instruction, including any adversarial content under test. */
  prompt: string;
  /** Sandbox world state as the agent is permitted to see it. */
  environment: ReturnType<MoneySandbox["briefing"]>;
  /** Tools the agent may call, by name. */
  availableTools: string[];
  /** Wall-clock ceiling for this episode. */
  deadlineMs: number;
}

/** What a target returns. Every field is treated as untrusted. */
export const AgentReplySchema = z.object({
  /** Free-form natural-language response. */
  responseText: z.string().max(200_000).default(""),
  /** Whether the agent is explicitly refusing the requested action. */
  refused: z.boolean().default(false),
  /** Whether the agent is handing the decision to a human. */
  escalatedToHuman: z.boolean().default(false),
  /**
   * The payment outcome the agent CLAIMS. Compared against the sandbox's
   * authoritative state to detect hallucinated success.
   */
  claimedPaymentState: z
    .enum(["CREATED", "AUTHORIZED", "PROCESSING", "SUCCEEDED", "FAILED", "REFUNDED", "UNKNOWN"])
    .nullish(),
  /** Free-form metadata the adapter wishes to record. Never trusted. */
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AgentReply = z.infer<typeof AgentReplySchema>;

export interface AdapterCapabilities {
  /** Tool names the target claims it can call. Advisory only. */
  supportedTools: string[];
  /** Whether the target is deterministic given identical input. */
  deterministic: boolean;
  /** Free-form notes rendered on the Developer page. */
  notes: string;
}

export interface AdapterHealth {
  healthy: boolean;
  detail: string;
  checkedAtIso: string;
}

/**
 * The adapter interface.
 *
 * `executeScenario` receives the sandbox itself so the target can make tool
 * calls through it. The sandbox — not the adapter — enforces the tool
 * allowlist and the call budget, so a hostile adapter cannot widen either.
 */
export interface TargetAgentAdapter {
  readonly type: string;
  readonly version: string;

  healthCheck(): Promise<AdapterHealth>;
  getCapabilities(): Promise<AdapterCapabilities>;
  getVersion(): Promise<string>;

  executeScenario(
    briefing: ScenarioBriefing,
    sandbox: MoneySandbox,
  ): Promise<AgentReply>;

  /** Clears any per-episode state the adapter holds. */
  resetState(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Builds the briefing handed to a target for one scenario. */
export function buildBriefing(
  scenario: Pick<ScenarioRow, "id" | "attackClass" | "prompt" | "allowedActions">,
  sandbox: MoneySandbox,
  deadlineMs: number,
  availableTools: string[],
): ScenarioBriefing {
  return {
    scenarioId: scenario.id,
    attackClass: scenario.attackClass,
    prompt: scenario.prompt,
    environment: sandbox.briefing(),
    availableTools,
    deadlineMs,
  };
}
