import { getEnv } from "../shared/env";
import { AppError } from "../shared/errors";
import { logger } from "../shared/logger";
import type { MoneySandbox } from "../simulator/sandbox";
import {
  AgentReplySchema,
  type AdapterCapabilities,
  type AdapterHealth,
  type AgentReply,
  type ScenarioBriefing,
  type TargetAgentAdapter,
} from "./contract";

/**
 * Generic HTTP adapter for third-party targets.
 *
 * ---------------------------------------------------------------------------
 * SANDBOX BOUNDARY
 * ---------------------------------------------------------------------------
 * The target is assumed hostile. Concretely:
 *
 *   - Only hosts on ADAPTER_ALLOWED_HOSTS may be contacted. The default is
 *     loopback only, and an empty list blocks every outbound adapter. This is
 *     an allowlist rather than a denylist because a denylist plus DNS is not a
 *     control.
 *   - Responses are size-capped before parsing, so a target cannot exhaust
 *     memory by streaming.
 *   - Responses are schema-validated; unknown fields are stripped rather than
 *     forwarded into the evidence record.
 *   - The target's tool calls are executed through the sandbox, which owns the
 *     allowlist and the call budget. A target cannot widen either by asking.
 *   - A timeout yields INCONCLUSIVE upstream, never PASS.
 *
 * Credentials for the target's own endpoint are read from the environment by
 * name and never stored in `adapter_config` or written to a log line.
 */

interface HttpAdapterConfig {
  /** Absolute URL of the target's scenario endpoint. */
  endpoint: string;
  /** Name of the env var holding the bearer token, never the token itself. */
  authTokenEnvVar?: string;
  version?: string;
}

interface TargetToolCall {
  tool?: unknown;
  args?: unknown;
}

export class HttpTargetAdapter implements TargetAgentAdapter {
  readonly type = "http";
  readonly version: string;
  private readonly config: HttpAdapterConfig;

  constructor(config: HttpAdapterConfig) {
    this.config = config;
    this.version = config.version ?? "http-adapter-1.0.0";
    // Validate at construction so a blocked host is a registration error rather
    // than a mid-certification surprise.
    assertHostAllowed(config.endpoint);
  }

  private authHeader(): Record<string, string> {
    const name = this.config.authTokenEnvVar;
    if (!name) return {};
    const value = process.env[name];
    return value ? { authorization: `Bearer ${value}` } : {};
  }

  async healthCheck(): Promise<AdapterHealth> {
    const checkedAtIso = new Date().toISOString();
    try {
      const res = await this.fetchWithTimeout(`${trimSlash(this.config.endpoint)}/health`, {
        method: "GET",
      });
      return {
        healthy: res.ok,
        detail: res.ok ? `Target responded ${res.status}.` : `Target responded ${res.status}.`,
        checkedAtIso,
      };
    } catch (error) {
      return {
        healthy: false,
        detail: `Target unreachable: ${error instanceof Error ? error.message : String(error)}`,
        checkedAtIso,
      };
    }
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    try {
      const res = await this.fetchWithTimeout(`${trimSlash(this.config.endpoint)}/capabilities`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Partial<AdapterCapabilities>;
      return {
        supportedTools: Array.isArray(body.supportedTools) ? body.supportedTools : [],
        // A target claiming determinism is not evidence of it. The harness
        // measures consistency itself via repeated trials.
        deterministic: body.deterministic === true,
        notes: typeof body.notes === "string" ? body.notes : "",
      };
    } catch {
      return { supportedTools: [], deterministic: false, notes: "Capabilities unavailable." };
    }
  }

  async getVersion(): Promise<string> {
    return this.version;
  }

  async resetState(): Promise<void> {
    try {
      await this.fetchWithTimeout(`${trimSlash(this.config.endpoint)}/reset`, { method: "POST" });
    } catch {
      // A target without a reset endpoint is acceptable; repeated trials will
      // reveal any state carried between episodes as inconsistency.
    }
  }

  async shutdown(): Promise<void> {
    /* No persistent connection held. */
  }

  async executeScenario(briefing: ScenarioBriefing, sandbox: MoneySandbox): Promise<AgentReply> {
    const res = await this.fetchWithTimeout(`${trimSlash(this.config.endpoint)}/scenario`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeader() },
      body: JSON.stringify(briefing),
    });

    if (!res.ok) {
      throw new AppError("ADAPTER_UNAVAILABLE", `Target returned HTTP ${res.status}.`, {
        details: { status: res.status },
      });
    }

    const raw = await this.readCapped(res);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError("TARGET_MALFORMED_RESPONSE", "Target response was not valid JSON.");
    }

    // Execute any tool calls the target requested, through the sandbox, which
    // enforces the allowlist and the budget.
    const toolCalls = (parsed as { toolCalls?: TargetToolCall[] }).toolCalls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        sandbox.callTool({
          tool: String(call?.tool ?? ""),
          args:
            call?.args && typeof call.args === "object"
              ? (call.args as Record<string, unknown>)
              : {},
        });
      }
    }

    const reply = AgentReplySchema.safeParse(parsed);
    if (!reply.success) {
      throw new AppError("TARGET_MALFORMED_RESPONSE", "Target response failed schema validation.", {
        details: {
          problems: reply.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        },
      });
    }

    return reply.data;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    assertHostAllowed(url);
    const controller = new AbortController();
    const timeoutMs = getEnv().TARGET_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("TARGET_TIMEOUT", `Target did not respond within ${timeoutMs}ms.`, {
          details: { timeoutMs },
        });
      }
      throw new AppError("ADAPTER_UNAVAILABLE", "Target could not be reached.", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reads at most TARGET_MAX_RESPONSE_BYTES, refusing anything larger. */
  private async readCapped(res: Response): Promise<string> {
    const limit = getEnv().TARGET_MAX_RESPONSE_BYTES;
    const reader = res.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          throw new AppError(
            "TARGET_RESPONSE_TOO_LARGE",
            `Target response exceeded ${limit} bytes and was refused.`,
            { details: { limitBytes: limit } },
          );
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Allowlist check.
 *
 * Refuses anything not explicitly permitted, including a URL that parses to a
 * host not on the list. An empty allowlist blocks all outbound adapters, which
 * is the safe default for an installation that only certifies bundled agents.
 */
export function assertHostAllowed(url: string): void {
  const allowed = getEnv().adapterAllowedHosts;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("ADAPTER_UNSUPPORTED", "Adapter endpoint is not a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("ADAPTER_UNSUPPORTED", `Unsupported scheme '${parsed.protocol}'.`);
  }

  if (allowed.length === 0) {
    throw new AppError(
      "ADAPTER_HOST_BLOCKED",
      "No outbound adapter hosts are permitted. Set ADAPTER_ALLOWED_HOSTS to enable HTTP targets.",
    );
  }

  if (!allowed.includes(parsed.hostname)) {
    logger.warn("adapter_host_blocked", { hostname: parsed.hostname, allowed });
    throw new AppError(
      "ADAPTER_HOST_BLOCKED",
      `Host '${parsed.hostname}' is not on the adapter allowlist.`,
      { details: { allowedHosts: allowed } },
    );
  }
}
