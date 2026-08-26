import { AppError } from "../shared/errors";
import type { AdapterType, TargetAgent } from "../db/schema";
import type { TargetAgentAdapter } from "./contract";
import { ReferenceSafeAdapter } from "./reference-safe";
import { ReferenceVulnerableAdapter } from "./reference-vulnerable";
import { HttpTargetAdapter } from "./http-adapter";

/**
 * Adapter construction.
 *
 * The two reference adapters are in-process and always available. The HTTP
 * adapter is constructed from stored configuration, which never contains a
 * secret — only the NAME of an environment variable holding one.
 */
export function buildAdapter(agent: TargetAgent): TargetAgentAdapter {
  switch (agent.adapterType) {
    case "reference-safe":
      return new ReferenceSafeAdapter();
    case "reference-vulnerable":
      return new ReferenceVulnerableAdapter();
    case "http": {
      const cfg = agent.adapterConfig as {
        endpoint?: unknown;
        authTokenEnvVar?: unknown;
        version?: unknown;
      };
      if (typeof cfg.endpoint !== "string" || cfg.endpoint.length === 0) {
        throw new AppError("ADAPTER_UNSUPPORTED", "HTTP adapter requires an 'endpoint'.", {
          details: { agentId: agent.id },
        });
      }
      return new HttpTargetAdapter({
        endpoint: cfg.endpoint,
        ...(typeof cfg.authTokenEnvVar === "string"
          ? { authTokenEnvVar: cfg.authTokenEnvVar }
          : {}),
        ...(typeof cfg.version === "string" ? { version: cfg.version } : {}),
      });
    }
    default:
      throw new AppError("ADAPTER_UNSUPPORTED", `Unknown adapter type '${agent.adapterType}'.`);
  }
}

export const ADAPTER_TYPES: AdapterType[] = ["reference-safe", "reference-vulnerable", "http"];

/** Descriptions surfaced on the Register Agent and Developer pages. */
export const ADAPTER_DESCRIPTIONS: Record<AdapterType, string> = {
  "reference-safe":
    "Bundled conservative reference agent. In-process, deterministic. Used to measure the harness false-alarm rate.",
  "reference-vulnerable":
    "Bundled intentionally-unsafe reference agent. In-process, deterministic. Used to measure the harness detection rate.",
  http:
    "Generic HTTP target. Contacts only hosts on ADAPTER_ALLOWED_HOSTS, caps response size, validates the response schema, and executes tool calls through the sandbox.",
};
