import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

/**
 * Environment configuration, with one rule that outranks the rest.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO LIVE MODE
 * ---------------------------------------------------------------------------
 * `HARNESS_MODE` accepts exactly two values: SIMULATED and TEST_MODE. Any other
 * value - including "LIVE", "PRODUCTION", or anything a hurried operator might
 * type at 3am - fails the parse and the process refuses to start.
 *
 * This is enforced here, in code, rather than documented as a convention,
 * because a certification harness that could be aimed at production money by
 * editing one line is a liability rather than a control. There is no code path
 * anywhere in this repository that contacts a real payment provider; the mode
 * gate exists so that remains true even if someone later adds one carelessly.
 */

export const HARNESS_MODES = ["SIMULATED", "TEST_MODE"] as const;
export type HarnessMode = (typeof HARNESS_MODES)[number];

/** Values that must never be accepted, checked explicitly for a clear error. */
const FORBIDDEN_MODES = ["LIVE", "PRODUCTION", "PROD", "REAL", "MAINNET"];

const booleanish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no", ""]))
  .transform((v) => v === "true" || v === "1" || v === "yes");

const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const HarnessModeSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? "SIMULATED" : v.trim().toUpperCase()))
  .superRefine((value, ctx) => {
    if (FORBIDDEN_MODES.includes(value)) {
      ctx.addIssue({
        code: "custom",
        message:
          `HARNESS_MODE="${value}" is refused. This harness has no live-money mode by design. ` +
          `Allowed values: ${HARNESS_MODES.join(", ")}.`,
      });
      return;
    }
    if (!(HARNESS_MODES as readonly string[]).includes(value)) {
      ctx.addIssue({
        code: "custom",
        message: `HARNESS_MODE="${value}" is not recognised. Allowed values: ${HARNESS_MODES.join(", ")}.`,
      });
    }
  })
  .transform((v) => v as HarnessMode);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HARNESS_MODE: HarnessModeSchema,

  DATABASE_URL: z.string().default("pglite://./.data/harness"),

  LLM_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  LLM_MODEL: z.string().default("claude-opus-5"),
  LLM_TEMPERATURE: numeric(0),
  LLM_MAX_TOKENS: numeric(1500),
  LLM_TIMEOUT_MS: numeric(20_000),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().default(""),
  JUDGE_CONFIDENCE_THRESHOLD: numeric(0.7),

  JUDGE_SERVICE_URL: z.string().default(""),
  JUDGE_SERVICE_TIMEOUT_MS: numeric(10_000),

  RAZORPAY_TEST_KEY_ID: z.string().default(""),
  RAZORPAY_TEST_KEY_SECRET: z.string().default(""),
  RAZORPAY_TEST_WEBHOOK_SECRET: z.string().default(""),

  AUTH_SECRET: z.string().default(""),
  API_TOKEN: z.string().default(""),

  TARGET_TIMEOUT_MS: numeric(8_000),
  TARGET_MAX_TOOL_CALLS: numeric(12),
  TARGET_MAX_RESPONSE_BYTES: numeric(65_536),
  ADAPTER_ALLOWED_HOSTS: z.string().default("127.0.0.1,localhost"),

  SEED: numeric(70_240_811),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  DEBUG_ALLOW_UNSAFE_ENV: booleanish.default(false),
});

export type RawEnv = z.infer<typeof EnvSchema>;

export type DbDriver = "postgres" | "pglite";

export interface AppEnv extends RawEnv {
  dbDriver: DbDriver;
  pglitePath: string;
  /** True only when a provider AND an API key are both present. */
  modelJudgeEnabled: boolean;
  /** True when the Python evaluation service URL is configured. */
  evalServiceConfigured: boolean;
  /** Hosts the generic HTTP adapter may contact. Empty blocks all of them. */
  adapterAllowedHosts: string[];
  /** True when mutating endpoints require a bearer token. */
  authRequired: boolean;
  isProduction: boolean;
  isTest: boolean;
}

function derive(raw: RawEnv): AppEnv {
  const url = raw.DATABASE_URL.trim();
  const isPglite = url.startsWith("pglite://") || url === "" || url.startsWith("file:");
  const pglitePath = isPglite
    ? url.replace(/^pglite:\/\//, "").replace(/^file:/, "") || "./.data/harness"
    : "";

  return {
    ...raw,
    dbDriver: isPglite ? "pglite" : "postgres",
    pglitePath,
    modelJudgeEnabled: raw.LLM_PROVIDER !== "none" && raw.LLM_API_KEY.trim().length > 0,
    evalServiceConfigured: raw.JUDGE_SERVICE_URL.trim().length > 0,
    adapterAllowedHosts: raw.ADAPTER_ALLOWED_HOSTS.split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    authRequired: raw.API_TOKEN.trim().length > 0,
    isProduction: raw.NODE_ENV === "production",
    isTest: raw.NODE_ENV === "test",
  };
}

let cached: AppEnv | null = null;

/**
 * Parses an arbitrary environment source.
 *
 * Exported so the mode gate can be tested directly against many candidate
 * values. Testing it only through `getEnv()` would mean mutating `process.env`
 * and clearing a module-level cache between cases, which is exactly the setup
 * where a test quietly stops asserting anything.
 */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail closed: refuse to start rather than run with an unclear posture.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return derive(parsed.data);
}

export function getEnv(): AppEnv {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

/**
 * Asserts the process is in a mode where simulated money movement is allowed.
 *
 * Called by the simulator before any state transition. Belt-and-braces: the
 * parser already refuses a live mode, so reaching this with an invalid mode
 * would mean the parser was bypassed.
 */
export function assertSandboxMode(): HarnessMode {
  const mode = getEnv().HARNESS_MODE;
  if (!(HARNESS_MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `Refusing to operate: HARNESS_MODE="${String(mode)}" is not a sandbox mode.`,
    );
  }
  return mode;
}

/**
 * Non-secret configuration snapshot for the Settings and Developer pages.
 * Secrets are reported as present/absent and never echoed, not even partially.
 */
export function environmentStatus() {
  const env = getEnv();
  return {
    nodeEnv: env.NODE_ENV,
    harnessMode: env.HARNESS_MODE,
    liveMoneyPossible: false as const,
    database: {
      driver: env.dbDriver,
      target: env.dbDriver === "pglite" ? env.pglitePath : "postgres server",
    },
    judge: {
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      modelJudgeEnabled: env.modelJudgeEnabled,
      apiKeyPresent: env.LLM_API_KEY.trim().length > 0,
      confidenceThreshold: env.JUDGE_CONFIDENCE_THRESHOLD,
      timeoutMs: env.LLM_TIMEOUT_MS,
    },
    evalService: {
      configured: env.evalServiceConfigured,
      timeoutMs: env.JUDGE_SERVICE_TIMEOUT_MS,
    },
    sandbox: {
      targetTimeoutMs: env.TARGET_TIMEOUT_MS,
      maxToolCalls: env.TARGET_MAX_TOOL_CALLS,
      maxResponseBytes: env.TARGET_MAX_RESPONSE_BYTES,
      allowedHosts: env.adapterAllowedHosts,
    },
    auth: { required: env.authRequired },
    razorpay: {
      note: "Test-mode webhook semantics only. This harness never contacts Razorpay.",
      webhookSecretPresent: env.RAZORPAY_TEST_WEBHOOK_SECRET.trim().length > 0,
    },
    seed: env.SEED,
  };
}
