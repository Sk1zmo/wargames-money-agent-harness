import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { targetAgents } from "../db/schema";
import type { AdapterType, TargetAgent } from "../db/schema";
import { AppError } from "../shared/errors";
import { deterministicId, newId } from "../shared/ids";
import { ADAPTER_CONTRACT_VERSION } from "../adapters/contract";
import { buildAdapter } from "../adapters/registry";
import { recordAudit } from "../audit/service";

/**
 * Target-agent registry.
 *
 * The two bundled reference agents are registered here with fixed ids so that
 * self-evaluation always measures the same two implementations. Third-party
 * agents get generated ids.
 *
 * `adapterConfig` is stored verbatim EXCEPT that it must never contain a
 * credential. The HTTP adapter takes `authTokenEnvVar` - the NAME of an
 * environment variable - not a token. `assertNoSecrets` rejects anything that
 * looks like an inline secret at registration time rather than discovering it
 * in a database dump later.
 */

const SECRET_KEY_PATTERN = /(secret|token|password|apikey|api_key|credential|private_key)$/i;
const ALLOWED_SECRETY_KEYS = new Set(["authTokenEnvVar"]);

export function assertNoSecrets(config: Record<string, unknown>, path = "adapterConfig"): void {
  for (const [key, value] of Object.entries(config)) {
    const here = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key) && !ALLOWED_SECRETY_KEYS.has(key)) {
      throw new AppError(
        "ADAPTER_CONFIG_INVALID",
        `${here} looks like an inline credential. Store the credential in an environment variable and pass 'authTokenEnvVar' with its NAME instead.`,
      );
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertNoSecrets(value as Record<string, unknown>, here);
    }
  }
}

export interface RegisterAgentInput {
  name: string;
  version: string;
  adapterType: AdapterType;
  adapterConfig?: Record<string, unknown>;
  description?: string;
  capabilities?: string[];
  isReference?: boolean;
  referenceKind?: "safe" | "vulnerable";
  correlationId: string;
  actorId?: string;
}

export async function registerAgent(
  db: Database,
  input: RegisterAgentInput,
): Promise<TargetAgent> {
  const config = input.adapterConfig ?? {};
  assertNoSecrets(config);

  const existing = await db
    .select()
    .from(targetAgents)
    .where(eq(targetAgents.name, input.name))
    .limit(100);
  const duplicate = existing.find((a) => a.version === input.version);
  if (duplicate) {
    throw new AppError(
      "AGENT_ALREADY_REGISTERED",
      `An agent named '${input.name}' at version '${input.version}' is already registered. Register a new version rather than mutating a certified one.`,
      { details: { agentId: duplicate.id } },
    );
  }

  const id = input.isReference
    ? deterministicId("agt", `${input.name}-${input.version}`)
    : newId("agt");

  const [row] = await db
    .insert(targetAgents)
    .values({
      id,
      name: input.name,
      version: input.version,
      adapterType: input.adapterType,
      adapterVersion: ADAPTER_CONTRACT_VERSION,
      adapterConfig: config,
      capabilities: input.capabilities ?? [],
      status: "REGISTERED",
      isReference: input.isReference ?? false,
      referenceKind: input.referenceKind ?? null,
      description: input.description ?? "",
    })
    .returning();

  await recordAudit(db, {
    actorType: "USER",
    actorId: input.actorId ?? "operator",
    action: "AGENT_REGISTERED",
    objectType: "target_agent",
    objectId: id,
    correlationId: input.correlationId,
    newState: {
      name: input.name,
      version: input.version,
      adapterType: input.adapterType,
      isReference: input.isReference ?? false,
    },
    result: "SUCCESS",
    severity: "notice",
  });

  return row as TargetAgent;
}

/** Runs the adapter's health check and records the real outcome. */
export async function healthCheckAgent(
  db: Database,
  agentId: string,
  correlationId: string,
): Promise<{ healthy: boolean; detail: string }> {
  const agent = await getAgent(db, agentId);
  const adapter = buildAdapter(agent);
  try {
    const health = await adapter.healthCheck();
    await db
      .update(targetAgents)
      .set({
        status: health.healthy ? "HEALTHY" : "UNREACHABLE",
        lastHealthCheckAt: new Date(health.checkedAtIso),
        lastHealthDetail: health.detail,
        updatedAt: new Date(),
      })
      .where(eq(targetAgents.id, agentId));

    await recordAudit(db, {
      actorType: "HARNESS",
      actorId: "agent-registry",
      action: "AGENT_HEALTH_CHECKED",
      objectType: "target_agent",
      objectId: agentId,
      correlationId,
      newState: { healthy: health.healthy, detail: health.detail },
      result: health.healthy ? "SUCCESS" : "FAILURE",
      severity: health.healthy ? "info" : "warning",
    });
    return { healthy: health.healthy, detail: health.detail };
  } finally {
    await adapter.shutdown();
  }
}

export async function getAgent(db: Database, agentId: string): Promise<TargetAgent> {
  const [row] = await db.select().from(targetAgents).where(eq(targetAgents.id, agentId)).limit(1);
  if (!row) throw new AppError("AGENT_NOT_FOUND", `No registered agent with id '${agentId}'.`);
  return row as TargetAgent;
}

export async function listAgents(db: Database): Promise<TargetAgent[]> {
  const rows = await db.select().from(targetAgents).orderBy(desc(targetAgents.createdAt));
  return rows as TargetAgent[];
}

export async function retireAgent(
  db: Database,
  agentId: string,
  correlationId: string,
): Promise<void> {
  const agent = await getAgent(db, agentId);
  if (agent.isReference) {
    throw new AppError(
      "AGENT_IMMUTABLE",
      "Reference agents cannot be retired: harness self-evaluation depends on them.",
    );
  }
  await db
    .update(targetAgents)
    .set({ status: "RETIRED", updatedAt: new Date() })
    .where(eq(targetAgents.id, agentId));
  await recordAudit(db, {
    actorType: "USER",
    actorId: "operator",
    action: "AGENT_RETIRED",
    objectType: "target_agent",
    objectId: agentId,
    correlationId,
    previousState: { status: agent.status },
    newState: { status: "RETIRED" },
    result: "SUCCESS",
    severity: "notice",
  });
}

/* -------------------------------------------------------------------------- */
/* Bundled reference agents                                                    */
/* -------------------------------------------------------------------------- */

export const REFERENCE_AGENTS: Array<Omit<RegisterAgentInput, "correlationId">> = [
  {
    name: "reference-safe-agent",
    version: "1.0.0",
    adapterType: "reference-safe",
    isReference: true,
    referenceKind: "safe",
    capabilities: ["authority-check", "cap-enforcement", "idempotency", "escalation"],
    description:
      "Bundled conservative reference agent. Reads its authority from the sandbox before acting, self-enforces its delegated cap, re-reads payment state before asserting an outcome, uses idempotency keys, and escalates when it cannot verify something. Used to measure the harness FALSE-ALARM rate: failures against this agent are candidate harness defects.",
  },
  {
    name: "reference-vulnerable-agent",
    version: "1.0.0",
    adapterType: "reference-vulnerable",
    isReference: true,
    referenceKind: "vulnerable",
    capabilities: ["naive-instruction-following"],
    description:
      "Bundled intentionally-unsafe reference agent. Follows the most recent directive it sees including untrusted content, does not check authority or caps, asserts success from creation, and omits idempotency keys. Used to measure the harness DETECTION rate. It is a test fixture, not an attack tool: it contains no reusable exploit against real payment infrastructure.",
  },
];

export async function ensureReferenceAgents(
  db: Database,
  correlationId: string,
): Promise<TargetAgent[]> {
  const out: TargetAgent[] = [];
  for (const spec of REFERENCE_AGENTS) {
    const id = deterministicId("agt", `${spec.name}-${spec.version}`);
    const [found] = await db.select().from(targetAgents).where(eq(targetAgents.id, id)).limit(1);
    if (found) {
      out.push(found as TargetAgent);
      continue;
    }
    out.push(await registerAgent(db, { ...spec, correlationId, actorId: "seed" }));
  }
  return out;
}

export async function getReferenceAgent(
  db: Database,
  kind: "safe" | "vulnerable",
): Promise<TargetAgent> {
  const spec = REFERENCE_AGENTS.find((a) => a.referenceKind === kind);
  if (!spec) throw new AppError("AGENT_NOT_FOUND", `No reference agent of kind '${kind}'.`);
  return getAgent(db, deterministicId("agt", `${spec.name}-${spec.version}`));
}
