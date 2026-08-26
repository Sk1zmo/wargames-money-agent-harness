import { getEnv } from "./env";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/**
 * Keys whose values are never written to a log line, at any depth.
 *
 * This harness handles target-agent configuration that may legitimately contain
 * a bearer token for the target's own endpoint, plus its own API token. Neither
 * may reach stdout, including when an adapter error object is logged wholesale.
 */
const REDACTED_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "apitoken",
  "api_token",
  "token",
  "secret",
  "password",
  "passphrase",
  "signature",
  "auth_secret",
  "key_secret",
  "keysecret",
  "webhook_secret",
  "webhooksecret",
  "razorpay_test_key_secret",
  "llm_api_key",
  "bearer",
  "credential",
  "credentials",
  "privatekey",
  "private_key",
  "cvv",
  "card_number",
  "pan",
]);

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated:depth]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  runId?: string;
  scenarioId?: string;
  agentId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, data?: LogContext): void;
  info(event: string, data?: LogContext): void;
  warn(event: string, data?: LogContext): void;
  error(event: string, data?: LogContext): void;
  child(bindings: LogContext): Logger;
}

let sink: "stdout" | "stderr" = "stdout";

export function setLogSink(target: "stdout" | "stderr"): void {
  sink = target;
}

function emit(level: LogLevel, event: string, bindings: LogContext, data?: LogContext): void {
  let configured: LogLevel | "silent" = "info";
  try {
    configured = getEnv().LOG_LEVEL;
  } catch {
    // Env not parseable yet (very early boot) - fall back to info.
  }
  if (LEVEL_RANK[level] < LEVEL_RANK[configured]) return;

  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redact({ ...bindings, ...data }) as Record<string, unknown>),
  };

  const serialized = JSON.stringify(line);
  if (level === "error" || sink === "stderr") process.stderr.write(`${serialized}\n`);
  else process.stdout.write(`${serialized}\n`);
}

function make(bindings: LogContext): Logger {
  return {
    debug: (event, data) => emit("debug", event, bindings, data),
    info: (event, data) => emit("info", event, bindings, data),
    warn: (event, data) => emit("warn", event, bindings, data),
    error: (event, data) => emit("error", event, bindings, data),
    child: (extra) => make({ ...bindings, ...extra }),
  };
}

export const logger: Logger = make({});

export function createLogger(bindings: LogContext): Logger {
  return make(bindings);
}

/** Times an async operation and returns both result and measured latency. */
export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const started = performance.now();
  const result = await fn();
  return { result, latencyMs: Math.round(performance.now() - started) };
}
